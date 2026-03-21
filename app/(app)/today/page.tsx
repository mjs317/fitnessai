import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function TodayPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div style={{ padding: '24px 16px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '28px', color: 'var(--text-primary)', marginBottom: '24px' }}>Today</h1>
      <p style={{ color: 'var(--text-muted)' }}>Loading your dashboard... (Phase 2 will build this screen)</p>
    </div>
  );
}
