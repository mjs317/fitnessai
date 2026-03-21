import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import WorkoutBuilder from '@/components/workouts/WorkoutBuilder';

export default async function WorkoutDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: workout, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !workout) notFound();

  return (
    <WorkoutBuilder
      initial={{
        id: workout.id,
        name: workout.name,
        type: workout.type,
        blocks: workout.blocks as any,
        notes: workout.notes,
      }}
    />
  );
}
