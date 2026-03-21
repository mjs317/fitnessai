import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import GymMode from '@/components/gym/GymMode';

export default async function GymPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scheduledId?: string }>;
}) {
  const { id } = await params;
  const { scheduledId } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: workout, error } = await supabase
    .from('workouts')
    .select('id, name, blocks')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !workout) notFound();

  return (
    <GymMode
      workout={workout as any}
      scheduledWorkoutId={scheduledId}
    />
  );
}
