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
      return NextResponse.json({ success: false, error: 'No saved credentials — reconnect Garmin first' }, { status: 400 });
    }

    // Try to use the MFA checkpoint captured during the initial login.
    // This avoids starting a new Garmin session (which would send a new code).
    if (settings.garmin_session_cookies) {
      try {
        const raw = decrypt(settings.garmin_session_cookies);
        const parsed = JSON.parse(raw);

        if (parsed.__mfa && parsed.formUrl) {
          console.log('[garmin/verify-mfa] Using saved MFA checkpoint, form URL:', parsed.formUrl);

          const { GarminConnect } = await import('garmin-connect');
          const { CookieJar } = await import('tough-cookie');

          // Create a gc instance and restore the SSO session cookies from the checkpoint
          const gc = new GarminConnect({
            username: email,
            password: decrypt(settings.garmin_password_encrypted),
          });
          const jar = CookieJar.fromJSON(JSON.parse(parsed.jarJson || '{}'));
          const axiosInst = (gc as any).client?.client;
          if (axiosInst) axiosInst.defaults.jar = jar;

          // POST the verification code directly to Garmin's MFA form
          const body = new URLSearchParams({ verificationCode: mfa_code.trim() });
          if (parsed.csrf) body.set('_csrf', parsed.csrf);

          console.log('[garmin/verify-mfa] Posting code to Garmin form...');
          const res = await axiosInst.post(parsed.formUrl, body.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            maxRedirects: 15,
          });
          console.log('[garmin/verify-mfa] Form POST status:', res.status);

          // Verify the session is now authenticated
          const info = await (gc as any).getUserInfo();
          console.log('[garmin/verify-mfa] getUserInfo succeeded:', !!info);

          // Save the authenticated session cookies
          const { getGarminSessionCookies } = await import('@/lib/garmin/client');
          const cookiesJson = await getGarminSessionCookies(gc);
          await serviceSupabase.from('user_settings').upsert({
            user_id: user.id,
            garmin_session_cookies: cookiesJson ? encrypt(cookiesJson) : null,
            updated_at: new Date().toISOString(),
          });

          return NextResponse.json({ success: true });
        }
      } catch (savedStateErr: any) {
        console.error('[garmin/verify-mfa] Saved-state approach failed:', savedStateErr.message);
        // Fall through to the re-login approach below
      }
    }

    // Fallback: start a new login with the code ready in the MFA handler.
    // Note: this sends Garmin a new MFA email — the code the user entered
    // was for the previous session and will likely not match. This path
    // exists only as a safety net if no checkpoint was saved.
    console.warn('[garmin/verify-mfa] No MFA checkpoint found — falling back to re-login (may fail if code is stale)');

    const { createGarminClientWithMFA, getGarminSessionCookies } = await import('@/lib/garmin/client');
    const gc = await createGarminClientWithMFA(email, settings.garmin_password_encrypted, mfa_code.trim());

    const cookiesJson = await getGarminSessionCookies(gc);
    await serviceSupabase.from('user_settings').upsert({
      user_id: user.id,
      garmin_session_cookies: cookiesJson ? encrypt(cookiesJson) : null,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[garmin/verify-mfa] Error:', err.message);
    const isBadCode = /invalid|expired|incorrect|verif/i.test(err.message || '');
    return NextResponse.json(
      { success: false, error: isBadCode ? 'Invalid or expired code — check your email and try again' : err.message },
      { status: isBadCode ? 400 : 500 },
    );
  }
}
