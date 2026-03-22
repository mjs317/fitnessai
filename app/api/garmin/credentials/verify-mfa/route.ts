import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { encrypt, decrypt } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { email, mfa_code } = await request.json();
    if (!email || !mfa_code) {
      return NextResponse.json({ success: false, error: 'Missing email or mfa_code' }, { status: 400 });
    }

    const serviceSupabase = await createServiceRoleClient();
    const { data: settings } = await serviceSupabase
      .from('user_settings')
      .select('garmin_password_encrypted, garmin_session_cookies')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!settings?.garmin_password_encrypted) {
      return NextResponse.json(
        { success: false, error: 'No saved credentials — reconnect Garmin first' },
        { status: 400 },
      );
    }

    const { createGarminClientWithMFA, getGarminSessionCookies } = await import('@/lib/garmin/client');

    // Try to use the MFA form state saved during the initial login attempt.
    // Using the saved form URL avoids starting a new Garmin session, which
    // would send a second MFA email and invalidate the user's current code.
    // Use the MFA form state saved during the initial login.
    // If no saved state exists the user should Cancel and reconnect.
    if (!settings.garmin_session_cookies) {
      throw new Error('MFA session expired — please click Cancel and reconnect Garmin to get a new code');
    }
    const raw = decrypt(settings.garmin_session_cookies);
    const parsed = JSON.parse(raw);
    if (!parsed.__mfa || !parsed.formUrl) {
      throw new Error('MFA session expired — please click Cancel and reconnect Garmin to get a new code');
    }

    console.log('[garmin/verify-mfa] Using saved MFA checkpoint:', parsed.formUrl);
    const gc = await createGarminClientWithMFA(
      email,
      settings.garmin_password_encrypted,
      parsed.formUrl,
      parsed.hiddenFields ?? {},
      mfa_code.trim(),
    );

    // Save OAuth tokens for future session restore
    const tokensJson = getGarminSessionCookies(gc);
    await serviceSupabase.from('user_settings').upsert({
      user_id: user.id,
      garmin_session_cookies: tokensJson ? encrypt(tokensJson) : null,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[garmin/verify-mfa] Error:', err.message);
    const isBadCode = /invalid|expired|incorrect|verif/i.test(err.message ?? '');
    return NextResponse.json(
      {
        success: false,
        error: isBadCode
          ? 'Invalid or expired code — check your email and try again'
          : err.message,
      },
      { status: isBadCode ? 400 : 500 },
    );
  }
}
