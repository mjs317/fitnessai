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

    // Test credentials before saving
    try {
      const { createGarminClient } = await import('@/lib/garmin/client');
      const encryptedPw = encrypt(password);
      await createGarminClient(email, encryptedPw);

      // Save encrypted credentials
      const serviceSupabase = await createServiceRoleClient();
      await serviceSupabase.from('user_settings').upsert({
        user_id: user.id,
        garmin_email: email,
        garmin_password_encrypted: encryptedPw,
        updated_at: new Date().toISOString(),
      });

      return NextResponse.json({ success: true });
    } catch (loginErr: any) {
      return NextResponse.json({ success: false, error: 'Login failed: ' + loginErr.message });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
