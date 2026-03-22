import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';

// POST /api/apple-health/setup
// Generates (or returns existing) webhook token and URL for the user.
export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serviceSupabase = await createServiceRoleClient();
  const { data: settings } = await serviceSupabase
    .from('user_settings')
    .select('apple_health_webhook_token')
    .eq('user_id', user.id)
    .maybeSingle();

  let token = settings?.apple_health_webhook_token;
  if (!token) {
    token = randomBytes(24).toString('hex');
    const { error: upsertErr } = await serviceSupabase.from('user_settings').upsert(
      { user_id: user.id, apple_health_webhook_token: token, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (upsertErr) {
      console.error('[apple-health/setup] Failed to save token:', upsertErr.message);
      return NextResponse.json({ error: 'Failed to save webhook token: ' + upsertErr.message }, { status: 500 });
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.vercel.app';
  return NextResponse.json({ token, webhookUrl: `${baseUrl}/api/apple-health/webhook?token=${token}` });
}
