import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const encryptedPw = encrypt(password);
    const serviceSupabase = await createServiceRoleClient();

    // Save credentials immediately so verify-mfa can retrieve them even if we error below
    await serviceSupabase.from('user_settings').upsert({
      user_id: user.id,
      garmin_email: email,
      garmin_password_encrypted: encryptedPw,
      garmin_session_cookies: null,
      updated_at: new Date().toISOString(),
    });

    const { loginWithMFADetection, getGarminSessionCookies } = await import('@/lib/garmin/client');

    try {
      const result = await loginWithMFADetection(email, password);

      if (result.type === 'success') {
        // Serialise OAuth tokens for future session restore
        const tokensJson = getGarminSessionCookies(result.gc);
        await serviceSupabase.from('user_settings').upsert({
          user_id: user.id,
          garmin_session_cookies: tokensJson ? encrypt(tokensJson) : null,
          updated_at: new Date().toISOString(),
        });
        return NextResponse.json({ success: true });
      }

      // MFA required — save form URL + all hidden fields so verify-mfa can POST
      // the code without starting a new Garmin session (= no new MFA email).
      const { formUrl, hiddenFields } = result;
      const mfaState = JSON.stringify({ __mfa: true, formUrl, hiddenFields });
      await serviceSupabase.from('user_settings').upsert({
        user_id: user.id,
        garmin_session_cookies: encrypt(mfaState),
        updated_at: new Date().toISOString(),
      });
      return NextResponse.json({ success: false, requires_mfa: true });
    } catch (loginErr: any) {
      console.error('[garmin/credentials] Login error:', loginErr.message);
      return NextResponse.json({ success: false, error: 'Login failed: ' + loginErr.message });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
