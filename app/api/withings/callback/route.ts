import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(new URL('/settings?withings=error', request.url));
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL('/login', request.url));

    // Exchange code for tokens
    const tokenRes = await fetch('https://wbsapi.withings.net/v2/oauth2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'requesttoken',
        grant_type: 'authorization_code',
        client_id: process.env.WITHINGS_CLIENT_ID!,
        client_secret: process.env.WITHINGS_CLIENT_SECRET!,
        code,
        redirect_uri: process.env.WITHINGS_CALLBACK_URL!,
      }),
    });

    const tokenData = await tokenRes.json();
    if (tokenData.status !== 0) {
      console.error('Withings token error:', tokenData);
      return NextResponse.redirect(new URL('/settings?withings=token_error', request.url));
    }

    const { access_token, refresh_token, expires_in } = tokenData.body;
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    const serviceSupabase = await createServiceRoleClient();
    await serviceSupabase.from('user_settings').upsert({
      user_id: user.id,
      withings_access_token: access_token,
      withings_refresh_token: refresh_token,
      withings_token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.redirect(new URL('/settings?withings=connected', request.url));
  } catch (err: any) {
    console.error('Withings callback error:', err.message);
    return NextResponse.redirect(new URL('/settings?withings=error', request.url));
  }
}
