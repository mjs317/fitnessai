import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { email, password } = await request.json();
    if (!email || !password) return NextResponse.json({ error: 'Email and password required' }, { status: 400 });

    const encryptedPw = encrypt(password);
    const serviceSupabase = await createServiceRoleClient();

    // Always save credentials first so verify-mfa can retrieve them
    await serviceSupabase.from('user_settings').upsert({
      user_id: user.id,
      garmin_email: email,
      garmin_password_encrypted: encryptedPw,
      garmin_session_cookies: null,
      updated_at: new Date().toISOString(),
    });

    const { GarminConnect } = await import('garmin-connect');
    const gc = new GarminConnect({ username: email, password });

    // Capture MFA form state if Garmin requires 2FA
    interface MfaState { formUrl: string; csrf: string; jarJson: string }
    let capturedMfa: MfaState | null = null;

    (gc as any).client.handleMFA = async function (htmlStr: string) {
      const actionMatch =
        htmlStr.match(/action="([^"]*verif[^"]*)"/i) ||
        htmlStr.match(/action="([^"]*mfa[^"]*)"/i) ||
        htmlStr.match(/<form[^>]+action="([^"]+)"/i);
      let formUrl = actionMatch?.[1] ?? '';
      if (formUrl && !formUrl.startsWith('http')) {
        formUrl = 'https://sso.garmin.com' + formUrl;
      }
      const csrf = htmlStr.match(/name="_csrf"\s+value="([^"]+)"/i)?.[1] ?? '';
      // Serialize the cookie jar at the MFA checkpoint — contains the active SSO session
      const jar = (this.client as any)?.defaults?.jar;
      const jarJson = jar?.toJSON ? JSON.stringify(jar.toJSON()) : '{}';
      capturedMfa = { formUrl, csrf, jarJson };
      console.log('[garmin/credentials] MFA required, captured form URL:', formUrl);
      throw new Error('__MFA_CAPTURED__');
    };

    try {
      await gc.login();

      // Login succeeded without MFA — save session cookies
      const { getGarminSessionCookies } = await import('@/lib/garmin/client');
      const cookiesJson = await getGarminSessionCookies(gc);
      await serviceSupabase.from('user_settings').upsert({
        user_id: user.id,
        garmin_session_cookies: cookiesJson ? encrypt(cookiesJson) : null,
        updated_at: new Date().toISOString(),
      });
      return NextResponse.json({ success: true });
    } catch (loginErr: any) {
      if (loginErr.message === '__MFA_CAPTURED__' && capturedMfa) {
        // Save MFA checkpoint (form URL + SSO cookies) so verify-mfa can use them
        const { formUrl, csrf, jarJson } = capturedMfa;
        const mfaPayload = JSON.stringify({ __mfa: true, formUrl, csrf, jarJson });
        await serviceSupabase.from('user_settings').upsert({
          user_id: user.id,
          garmin_session_cookies: encrypt(mfaPayload),
          updated_at: new Date().toISOString(),
        });
        return NextResponse.json({ success: false, requires_mfa: true });
      }
      console.error('[garmin/credentials] Login error:', loginErr.message);
      return NextResponse.json({ success: false, error: 'Login failed: ' + loginErr.message });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
