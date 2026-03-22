import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { format, addDays, startOfWeek } from 'date-fns';
import TrainingClient from './TrainingClient';

export default async function TrainingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday
  const weekEnd = addDays(weekStart, 55); // 8 weeks

  const [scheduledRes, plansRes] = await Promise.allSettled([
    supabase
      .from('scheduled_workouts')
      .select(`
        id, scheduled_date, status, source, external_title, external_type, external_notes,
        workouts(id, name, type, estimated_duration_min)
      `)
      .eq('user_id', user.id)
      .gte('scheduled_date', format(weekStart, 'yyyy-MM-dd'))
      .lte('scheduled_date', format(weekEnd, 'yyyy-MM-dd'))
      .order('scheduled_date'),

    supabase
      .from('training_plans')
      .select('id, name, sport, race_distance, race_date, is_active')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const scheduled = scheduledRes.status === 'fulfilled' ? (scheduledRes.value.data ?? []) : [];
  const plans = plansRes.status === 'fulfilled' ? (plansRes.value.data ?? []) : [];

  return (
    <TrainingClient
      initialScheduled={scheduled as any}
      plans={plans as any}
      todayStr={format(today, 'yyyy-MM-dd')}
      weekStartStr={format(weekStart, 'yyyy-MM-dd')}
    />
  );
}
