import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { format } from 'date-fns';
import TodayClient from './TodayClient';

export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: workouts } = await supabase
    .from('scheduled_workouts')
    .select(`
      id, scheduled_date, status, source,
      external_title, external_type, external_notes,
      workouts(id, name, type, estimated_duration_min, blocks)
    `)
    .eq('user_id', user.id)
    .eq('scheduled_date', today)
    .order('created_at');

  return <TodayClient initialWorkouts={(workouts ?? []) as any} todayStr={today} />;
}
