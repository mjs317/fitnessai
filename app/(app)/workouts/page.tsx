import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import WorkoutsClient from './WorkoutsClient';

export default async function WorkoutsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: workouts } = await supabase
    .from('workouts')
    .select('id, name, type, estimated_duration_min, source, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return <WorkoutsClient initialWorkouts={workouts ?? []} />;
}
