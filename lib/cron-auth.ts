import { NextRequest } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

interface UserLike { id: string }

/**
 * Returns a user for the request from either:
 * - A live browser session (normal user request), or
 * - The Vercel cron secret header (automated cron invocation).
 *
 * For cron calls, looks up the first user who has the relevant
 * integration configured (garmin_email / withings_access_token /
 * trainingpeaks_ics_url).
 */
export async function getCronUser(
  request: NextRequest,
  credentialField: 'garmin_email' | 'withings_access_token' | 'trainingpeaks_ics_url' = 'garmin_email',
): Promise<UserLike | null> {
  const authHeader = request.headers.get('authorization');

  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    // Vercel cron invocation — find first user with this integration configured
    const serviceSupabase = await createServiceRoleClient();
    const { data } = await serviceSupabase
      .from('user_settings')
      .select('user_id')
      .not(credentialField, 'is', null)
      .limit(1)
      .maybeSingle();
    return data?.user_id ? { id: data.user_id } : null;
  }

  // Normal browser session
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
