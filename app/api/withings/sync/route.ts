import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { format, subDays } from 'date-fns';

async function refreshWithingsToken(serviceSupabase: any, userId: string, refreshToken: string) {
  const res = await fetch('https://wbsapi.withings.net/v2/oauth2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'refresh_token',
      client_id: process.env.WITHINGS_CLIENT_ID!,
      client_secret: process.env.WITHINGS_CLIENT_SECRET!,
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  if (data.status !== 0) throw new Error('Token refresh failed');

  const { access_token, refresh_token, expires_in } = data.body;
  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

  await serviceSupabase.from('user_settings').upsert({
    user_id: userId,
    withings_access_token: access_token,
    withings_refresh_token: refresh_token,
    withings_token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });

  return access_token;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceSupabase = await createServiceRoleClient();
    const { data: settings } = await serviceSupabase
      .from('user_settings')
      .select('withings_access_token, withings_refresh_token, withings_token_expires_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!settings?.withings_access_token) {
      return NextResponse.json({ success: false, error: 'Withings not connected' });
    }

    // Refresh token if expired or expiry is unknown
    let accessToken = settings.withings_access_token;
    if (!settings.withings_token_expires_at || new Date(settings.withings_token_expires_at) < new Date()) {
      accessToken = await refreshWithingsToken(serviceSupabase, user.id, settings.withings_refresh_token);
    }

    const yesterday = Math.floor(subDays(new Date(), 1).getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);

    // Fetch weight measurements (meastype 1 = weight in kg, 6 = body fat %)
    const measRes = await fetch(
      `https://wbsapi.withings.net/measure?action=getmeas&meastype=1,6&category=1&startdate=${yesterday}&enddate=${now}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const measData = await measRes.json();

    if (measData.status !== 0) {
      return NextResponse.json({ success: false, error: 'Withings API error: ' + measData.status });
    }

    const groups = measData.body?.measuregrps ?? [];
    let synced = 0;

    for (const group of groups) {
      const date = format(new Date(group.date * 1000), 'yyyy-MM-dd');
      const metrics: Record<string, any> = { user_id: user.id, date, source: 'withings' };

      for (const meas of group.measures) {
        const value = meas.value * Math.pow(10, meas.unit);
        if (meas.type === 1) {
          // Weight in kg → lbs
          metrics.weight_lbs = Math.round(value * 2.20462 * 10) / 10;
        } else if (meas.type === 6) {
          metrics.body_fat_pct = Math.round(value * 10) / 10;
        }
      }

      if (metrics.weight_lbs || metrics.body_fat_pct) {
        await serviceSupabase
          .from('health_metrics')
          .upsert(metrics, { onConflict: 'user_id,date' });
        synced++;
      }
    }

    await serviceSupabase.from('user_settings').upsert({
      user_id: user.id,
      withings_last_sync: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, synced, lastSync: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
