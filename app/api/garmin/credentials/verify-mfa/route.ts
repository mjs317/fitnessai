import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/crypto';

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
      .select('garmin_password_encrypted')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!settings?.garmin_password_encrypted) {
      return NextResponse.json({ success: false, error: 'No saved credentials — reconnect Garmin first' }, { status: 400 });
    }

    const { createGarminClientWithMFA, getGarminSessionCookies } = await import('@/lib/garmin/client');
    const gc = await createGarminClientWithMFA(email, settings.garmin_password_encrypted, mfa_code);

    // Save session cookies after successful MFA login
    const cookiesJson = await getGarminSessionCookies(gc);
    await serviceSupabase.from('user_settings').upsert({
      user_id: user.id,
      garmin_session_cookies: cookiesJson ? encrypt(cookiesJson) : null,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    const isBadCode = /invalid|expired|incorrect|verif/i.test(err.message || '');
    return NextResponse.json(
      { success: false, error: isBadCode ? 'Invalid or expired code — check your email and try again' : err.message },
      { status: isBadCode ? 400 : 500 },
    );
  }
}
