import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ProgramsClient from './ProgramsClient';

export default async function ProgramsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: plans } = await supabase
    .from('training_plans')
    .select('id, name, sport, weeks, is_active, plan_data, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return <ProgramsClient initialPlans={plans ?? []} />;
}
