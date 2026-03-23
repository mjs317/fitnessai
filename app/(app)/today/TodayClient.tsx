'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Play, CheckCircle, Plus, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface ScheduledWorkout {
  id: string;
  scheduled_date: string;
  status: string;
  source: string;
  external_title: string | null;
  external_type: string | null;
  external_notes: string | null;
  workouts: {
    id: string;
    name: string;
    type: string;
    estimated_duration_min: number | null;
    blocks: unknown[];
  } | null;
}

interface TodayClientProps {
  initialWorkouts: ScheduledWorkout[];
  todayStr: string;
}

const typeEmoji: Record<string, string> = {
  strength: '💪', crossfit: '🏋️', hyrox: '⚡', mixed: '🔥', rest: '😴', hiit: '🔥',
};

export default function TodayClient({ initialWorkouts, todayStr }: TodayClientProps) {
  const [workouts, setWorkouts] = useState(initialWorkouts);
  const [aiTip, setAiTip] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [rpe, setRpe] = useState(7);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const dateLabel = format(parseISO(todayStr), 'EEEE, MMMM d');
  const pending = workouts.filter(w => w.status === 'pending');
  const done = workouts.filter(w => w.status === 'completed' || w.status === 'auto-completed');

  const getName = (w: ScheduledWorkout) => w.workouts?.name || w.external_title || 'Workout';
  const getType = (w: ScheduledWorkout) => w.workouts?.type || w.external_type || 'strength';

  const openMarkDone = (id: string) => {
    setMarkingId(id);
    setRpe(7);
    setNotes('');
  };

  const handleMarkDone = async () => {
    if (!markingId) return;
    setSaving(true);
    const now = new Date().toISOString();
    const workout = workouts.find(w => w.id === markingId);

    await supabase.from('scheduled_workouts').update({
      status: 'completed',
      rpe_score: rpe,
      notes: notes.trim() || null,
      completed_at: now,
    }).eq('id', markingId);

    if (workout?.workouts?.id) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('workout_logs').insert({
          user_id: user.id,
          workout_id: workout.workouts.id,
          scheduled_workout_id: markingId,
          rpe_score: rpe,
          notes: notes.trim() || null,
          completed_at: now,
        });
      }
    }

    setWorkouts(prev => prev.map(w => w.id === markingId ? { ...w, status: 'completed' } : w));
    setSaving(false);
    setMarkingId(null);
  };

  const getAiTip = async () => {
    setAiLoading(true);
    try {
      const workout = workouts[0];
      const name = workout ? getName(workout) : 'general strength training';
      const res = await fetch('/api/ai/coach-tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workoutName: name, workoutType: workout ? getType(workout) : 'strength' }),
      });
      const data = await res.json();
      setAiTip(data.tip || 'Stay consistent, focus on form, and push a little harder than last time.');
    } catch {
      setAiTip('Stay consistent, focus on form, and push a little harder than last time.');
    }
    setAiLoading(false);
  };

  return (
    <div style={{ padding: '20px 16px', maxWidth: '700px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 4px', letterSpacing: '0.02em' }}>
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}
        </p>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '26px', color: 'var(--text-primary)', margin: 0 }}>
          {dateLabel}
        </h1>
      </div>

      {/* Today's Workouts */}
      <div style={{ marginBottom: '24px' }}>
        <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 10px' }}>
          TODAY'S WORKOUTS
        </p>

        {workouts.length === 0 && (
          <div style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border)', borderRadius: '12px', padding: '24px', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>🏋️</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '0 0 16px' }}>No workouts scheduled for today.</p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/workouts" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 16px', color: 'var(--text-muted)', fontSize: '13px', textDecoration: 'none', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500 }}>
                Browse Library
              </Link>
              <Link href="/workouts/new" style={{ background: 'var(--accent)', borderRadius: '8px', padding: '9px 16px', color: '#0A0A0A', fontSize: '13px', textDecoration: 'none', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Plus size={13} /> Create Workout
              </Link>
            </div>
          </div>
        )}

        {pending.map(w => (
          <div key={w.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <span style={{ fontSize: '28px' }}>{typeEmoji[getType(w)] || '💪'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>{getName(w)}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {getType(w).toUpperCase()}
                  {w.workouts?.estimated_duration_min && <span style={{ marginLeft: '8px' }}>· {w.workouts.estimated_duration_min}min</span>}
                </div>
              </div>
            </div>
            {w.external_notes && (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5, margin: '0 0 12px', whiteSpace: 'pre-line' }}>
                {w.external_notes.slice(0, 200)}
              </p>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              {w.workouts?.id && (
                <Link href={`/workouts/${w.workouts.id}/gym?scheduledId=${w.id}`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'var(--accent)', color: '#0A0A0A', borderRadius: '10px', padding: '13px 16px', fontSize: '15px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, textDecoration: 'none' }}>
                  <Play size={15} fill="#0A0A0A" /> Start Workout
                </Link>
              )}
              <button
                onClick={() => openMarkDone(w.id)}
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '10px', padding: '13px 16px', color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, cursor: 'pointer' }}
              >
                Mark Done
              </button>
            </div>
          </div>
        ))}

        {done.map(w => (
          <div key={w.id} style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '12px', padding: '14px 16px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <CheckCircle size={20} style={{ color: '#22C55E', flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{getName(w)}</div>
              <div style={{ fontSize: '12px', color: '#22C55E', marginTop: '2px' }}>Completed ✓</div>
            </div>
          </div>
        ))}
      </div>

      {/* Mark Done bottom sheet */}
      {markingId && (() => {
        const w = workouts.find(x => x.id === markingId);
        const name = w ? getName(w) : 'Workout';
        return (
          <div onClick={() => setMarkingId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', borderRadius: '16px 16px 0 0', padding: '28px', width: '100%', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)', margin: 0 }}>{name}</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0' }}>Log completed workout</p>
                </div>
                <button onClick={() => setMarkingId(null)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px' }}>×</button>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <label style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Effort (RPE)</label>
                  <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '28px', color: 'var(--accent)', lineHeight: 1 }}>{rpe}</span>
                </div>
                <input type="range" min={1} max={10} value={rpe} onChange={e => setRpe(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Easy (1)</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Max (10)</span>
                </div>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '13px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Notes (optional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="How did it feel?" rows={2} style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'DM Sans, sans-serif', resize: 'none', outline: 'none' }} />
              </div>
              <button onClick={handleMarkDone} disabled={saving} style={{ width: '100%', background: 'var(--accent)', color: '#0A0A0A', border: 'none', borderRadius: '10px', padding: '16px', fontSize: '16px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving...' : 'Log & Done ✓'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* AI Coach Tip */}
      <div>
        <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 10px' }}>
          AI COACH
        </p>

        {aiTip ? (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(232,255,61,0.25)', borderRadius: '12px', padding: '16px' }}>
            <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.65, margin: 0 }}>{aiTip}</p>
            <button onClick={() => setAiTip(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '12px', cursor: 'pointer', marginTop: '10px', fontFamily: 'Space Grotesk, sans-serif', padding: 0 }}>
              Dismiss
            </button>
          </div>
        ) : (
          <button
            onClick={getAiTip}
            disabled={aiLoading}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px', color: aiLoading ? 'var(--text-dim)' : 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '14px', cursor: aiLoading ? 'default' : 'pointer' }}
          >
            <Sparkles size={16} style={{ color: 'var(--accent)' }} />
            {aiLoading ? 'Getting coaching tip…' : 'Get AI Coaching Tip'}
          </button>
        )}
      </div>
    </div>
  );
}
