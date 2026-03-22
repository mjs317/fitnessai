import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SettingsClient from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: settings } = await supabase
    .from('user_settings')
    .select('garmin_email, garmin_last_sync, garmin_last_activity_sync, garmin_historical_seeded, withings_access_token, withings_last_sync, trainingpeaks_ics_url, trainingpeaks_last_sync, apple_health_webhook_token, apple_health_last_sync, timezone, daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g, weight_goal_lbs, body_fat_goal_pct')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <SettingsClient
      userEmail={user.email ?? ''}
      initialSettings={settings ?? {}}
    />
  );
}
