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
    let gc;
    if (settings.garmin_session_cookies) {
      try {
        const raw = decrypt(settings.garmin_session_cookies);
        const parsed = JSON.parse(raw);
        if (parsed.__mfa && parsed.formUrl) {
          console.log('[garmin/verify-mfa] Using saved MFA checkpoint:', parsed.formUrl);
          gc = await createGarminClientWithMFA(
            email,
            settings.garmin_password_encrypted,
            parsed.formUrl,
            parsed.csrf ?? '',
            mfa_code.trim(),
          );
        }
      } catch (e: any) {
        console.error('[garmin/verify-mfa] Saved-state approach failed:', e.message);
        // Fall through to retry below
      }
    }

    if (!gc) {
      // No saved form state (or it failed) — start a fresh login.
      // NOTE: this will send Garmin another MFA email; the user should
      // check for the newest code if this path is taken.
      console.warn('[garmin/verify-mfa] No MFA checkpoint — falling back to fresh login');
      const { loginWithMFADetection } = await import('@/lib/garmin/client');
      let mfaFormUrl = '';
      let mfaCsrf = '';
      const detection = await loginWithMFADetection(email, decrypt(settings.garmin_password_encrypted));
      if (detection.type === 'mfa') {
        mfaFormUrl = detection.formUrl;
        mfaCsrf = detection.csrf;
      }
      gc = await createGarminClientWithMFA(
        email,
        settings.garmin_password_encrypted,
        mfaFormUrl,
        mfaCsrf,
        mfa_code.trim(),
      );
    }

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
