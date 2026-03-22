'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Download } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';

interface SettingsClientProps {
  userEmail: string;
}

export default function SettingsClient({ userEmail }: SettingsClientProps) {
  const router = useRouter();
  const supabase = createClient();
  const [exporting, setExporting] = useState(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [workoutLogs, scheduledWorkouts, workouts] = await Promise.all([
        supabase.from('workout_logs').select('*').eq('user_id', user.id),
        supabase.from('scheduled_workouts').select('*').eq('user_id', user.id),
        supabase.from('workouts').select('*').eq('user_id', user.id),
      ]);
      const blob = new Blob([
        JSON.stringify({
          workout_logs: workoutLogs.data,
          scheduled_workouts: scheduledWorkouts.data,
          workouts: workouts.data,
        }, null, 2),
      ], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fitnesscoach-export-${format(new Date(), 'yyyy-MM-dd')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ padding: '20px 16px', maxWidth: '500px', margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '26px', color: 'var(--text-primary)', margin: '0 0 24px' }}>
        Settings
      </h1>

      {/* Account */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
        <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 12px' }}>Account</p>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 16px', fontFamily: 'DM Sans, sans-serif' }}>{userEmail}</p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={exportData}
            disabled={exporting}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 16px', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '13px' }}
          >
            <Download size={14} />
            {exporting ? 'Exporting…' : 'Export Data (JSON)'}
          </button>
          <button
            onClick={handleSignOut}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,68,68,0.1)', border: '1px solid #FF444433', borderRadius: '8px', padding: '10px 16px', color: '#FF4444', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '13px' }}
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </div>

      {/* App info */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
        <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 12px' }}>About</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            ['App', 'Fitness Coach'],
            ['Focus', 'Strength & CrossFit Tracking'],
            ['Features', 'Gym Mode · Program Import · AI Coaching'],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif' }}>{label}</span>
              <span style={{ color: 'var(--text-primary)', fontFamily: 'DM Sans, sans-serif' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
