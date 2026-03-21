import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';

export default async function GymPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: workout } = await supabase
    .from('workouts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!workout) notFound();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '32px', color: 'var(--accent)', marginBottom: '16px' }}>⚡ GYM MODE</div>
      <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '18px', color: 'var(--text-primary)', marginBottom: '8px' }}>{workout.name}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Phase 5 will build the full gym mode experience.</div>
    </div>
  );
}
