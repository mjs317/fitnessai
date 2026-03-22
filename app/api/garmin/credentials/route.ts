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

    try {
      const { createGarminClient, getGarminSessionCookies } = await import('@/lib/garmin/client');
      const encryptedPw = encrypt(password);
      const gc = await createGarminClient(email, encryptedPw);

      // Serialize session cookies so future syncs skip the login round-trip
      const cookiesJson = await getGarminSessionCookies(gc);

      const serviceSupabase = await createServiceRoleClient();
      await serviceSupabase.from('user_settings').upsert({
        user_id: user.id,
        garmin_email: email,
        garmin_password_encrypted: encryptedPw,
        garmin_session_cookies: cookiesJson ? encrypt(cookiesJson) : null,
        updated_at: new Date().toISOString(),
      });

      return NextResponse.json({ success: true });
    } catch (loginErr: any) {
      const isMfa = /mfa|ticket not found|verification/i.test(loginErr.message || '');
      if (isMfa) {
        // Save credentials (without session) so verify-mfa can retrieve them
        const encryptedPw = encrypt(password);
        const serviceSupabase = await createServiceRoleClient();
        await serviceSupabase.from('user_settings').upsert({
          user_id: user.id,
          garmin_email: email,
          garmin_password_encrypted: encryptedPw,
          updated_at: new Date().toISOString(),
        });
        return NextResponse.json({ success: false, requires_mfa: true });
      }
      return NextResponse.json({ success: false, error: 'Login failed: ' + loginErr.message });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
