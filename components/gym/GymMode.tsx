'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X, Check, Plus, SkipForward, ChevronDown, ChevronUp } from 'lucide-react';
import { beep, countdownBeep, startBeep, endBeep } from '@/lib/audio';
import { createClient } from '@/lib/supabase/client';

// ── Types ──────────────────────────────────────────────────────────────────

interface WorkoutExercise {
  id: string;
  name: string;
  sets?: number;
  reps?: number | string;
  weight_lbs?: number;
  distance_miles?: number;
  duration_sec?: number;
  notes?: string;
  superset?: boolean;
}

interface WorkoutBlock {
  id: string;
  type: 'strength' | 'emom' | 'amrap' | 'fortime' | 'tabata' | 'rest';
  label: string;
  config: {
    duration_min?: number;
    interval_sec?: number;
    time_cap_min?: number;
    work_sec?: number;
    rest_sec?: number;
    rounds?: number;
    rest_between_sets_sec?: number;
  };
  exercises: WorkoutExercise[];
}

interface GymModeProps {
  workout: { id: string; name: string; blocks: WorkoutBlock[] };
  scheduledWorkoutId?: string;
}

interface SetEntry {
  reps: string;
  weight: string;
  checked: boolean;
}

// ── Block normalizer ────────────────────────────────────────────────────────

function normalizeBlock(b: any): WorkoutBlock {
  return {
    ...b,
    label: b.label || b.name || b.type || 'Block',
    config: b.config || {},
    exercises: (b.exercises || []).map((e: any) => ({
      id: e.id || Math.random().toString(36).slice(2),
      name: e.name || 'Exercise',
      sets: e.sets ?? undefined,
      reps: e.reps ?? undefined,
      weight_lbs: e.weight_lbs ?? (e.weight ? parseFloat(e.weight) || undefined : undefined),
      distance_miles: e.distance_miles ?? undefined,
      duration_sec: e.duration_sec ?? undefined,
      notes: e.notes ?? undefined,
      superset: e.superset ?? undefined,
    })),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (secs: number) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const fmtRest = (sec: number) => `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;

// ── Rest Timer Row ──────────────────────────────────────────────────────────

function RestRow({ seconds, max, onSkip }: { seconds: number; max: number; onSkip: () => void }) {
  const pct = max > 0 ? (seconds / max) * 100 : 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 12px', margin: '2px 0',
      background: 'rgba(59,130,246,0.08)', borderRadius: '8px',
      border: '1px solid rgba(59,130,246,0.2)',
    }}>
      <div style={{ flex: 1, marginRight: '12px' }}>
        <div style={{ height: '3px', background: 'rgba(59,130,246,0.2)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#3B82F6', borderRadius: '2px', transition: 'width 0.9s linear' }} />
        </div>
      </div>
      <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '14px', color: '#3B82F6', minWidth: '40px', textAlign: 'center' }}>
        {fmtRest(seconds)}
      </span>
      <button
        onClick={onSkip}
        style={{ background: 'none', border: 'none', color: '#3B82F6', cursor: 'pointer', padding: '4px 6px', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '12px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600 }}
      >
        <SkipForward size={13} /> Skip
      </button>
    </div>
  );
}

// ── Timer Block overlay (EMOM / AMRAP / ForTime / Tabata / Rest) ────────────

function TimerBlockCard({ block, onDone }: { block: WorkoutBlock; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const ref = useRef<NodeJS.Timeout | null>(null);

  const { type, config, exercises } = block;
  const durationSec = type === 'emom' ? (config.duration_min || 12) * 60
    : type === 'amrap' ? (config.time_cap_min || 12) * 60
    : type === 'tabata' ? ((config.work_sec || 20) + (config.rest_sec || 10)) * (config.rounds || 8)
    : type === 'rest' ? (config.duration_min || 3) * 60
    : (config.time_cap_min || 20) * 60;
  const isCountUp = type === 'fortime';
  const display = isCountUp ? elapsed : Math.max(0, durationSec - elapsed);

  useEffect(() => {
    if (!running) { if (ref.current) clearInterval(ref.current); return; }
    ref.current = setInterval(() => {
      setElapsed(e => {
        const next = e + 1;
        if (!isCountUp && next >= durationSec) {
          clearInterval(ref.current!);
          endBeep();
          setRunning(false);
          setDone(true);
        }
        return next;
      });
    }, 1000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running, durationSec, isCountUp]);

  const start = () => { setRunning(true); startBeep(); };
  const pause = () => setRunning(false);
  const finish = () => { setRunning(false); setDone(true); onDone(); };

  const typeLabel: Record<string, string> = { emom: 'EMOM', amrap: 'AMRAP', fortime: 'For Time', tabata: 'Tabata', rest: 'Rest' };

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', marginBottom: '16px', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <div style={{ textAlign: 'left' }}>
          <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '15px', color: done ? '#22C55E' : 'var(--text-primary)' }}>
            {done ? '✓ ' : ''}{block.label}
          </span>
          <span style={{ marginLeft: '8px', background: 'rgba(232,255,61,0.12)', color: 'var(--accent)', borderRadius: '4px', padding: '1px 7px', fontSize: '10px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700 }}>
            {typeLabel[type] || type.toUpperCase()}
          </span>
        </div>
        {open ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '16px' }}>
          {/* Timer display */}
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '56px', color: 'var(--accent)', lineHeight: 1 }}>
              {fmt(display)}
            </div>
            {type === 'emom' && <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0' }}>{config.duration_min}min · every {config.interval_sec || 60}s</p>}
            {type === 'amrap' && <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0' }}>{config.time_cap_min}min time cap</p>}
            {type === 'tabata' && <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0' }}>{config.work_sec || 20}s work / {config.rest_sec || 10}s rest · {config.rounds || 8} rounds</p>}
          </div>

          {/* Exercise list for this block */}
          {exercises.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              {exercises.map((ex, i) => (
                <div key={ex.id} style={{ padding: '6px 0', borderBottom: i < exercises.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{ex.name}</span>
                  {ex.reps && <span style={{ color: 'var(--text-muted)', fontSize: '13px', marginLeft: '8px' }}>{ex.reps} reps</span>}
                </div>
              ))}
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {!done && !running && (
              <button onClick={start} style={{ flex: 1, minHeight: '48px', background: 'var(--accent)', color: '#0A0A0A', border: 'none', borderRadius: '10px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}>
                {elapsed > 0 ? 'Resume' : 'Start'}
              </button>
            )}
            {running && (
              <button onClick={pause} style={{ flex: 1, minHeight: '48px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '15px', cursor: 'pointer' }}>
                Pause
              </button>
            )}
            <button onClick={finish} style={{ flex: 1, minHeight: '48px', background: done ? '#22C55E22' : 'var(--bg-elevated)', border: done ? '1px solid #22C55E44' : '1px solid var(--border)', borderRadius: '10px', color: done ? '#22C55E' : 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '15px', cursor: 'pointer' }}>
              {done ? '✓ Done' : 'Mark Done'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Post-Workout Review ────────────────────────────────────────────────────

function PostWorkoutReview({
  workout,
  scheduledWorkoutId,
  durationMin,
  onFinish,
}: {
  workout: { id: string; name: string };
  scheduledWorkoutId?: string;
  durationMin: number;
  onFinish: () => void;
}) {
  const [rpe, setRpe] = useState(7);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  const handleSave = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/today'); return; }

    await supabase.from('workout_logs').insert({
      user_id: user.id,
      workout_id: workout.id,
      scheduled_workout_id: scheduledWorkoutId || null,
      rpe_score: rpe,
      notes: notes.trim() || null,
      duration_min: durationMin,
      completed_at: new Date().toISOString(),
    });

    if (scheduledWorkoutId) {
      await supabase.from('scheduled_workouts')
        .update({
          status: 'completed',
          rpe_score: rpe,
          notes: notes.trim() || null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', scheduledWorkoutId);
    }

    setSaving(false);
    router.push('/today');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 300, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: 'var(--bg-elevated)', borderRadius: '16px 16px 0 0', padding: '28px', width: '100%', border: '1px solid var(--border)' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>🏆</div>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '22px', color: 'var(--text-primary)', margin: '0 0 4px' }}>Workout Complete!</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>{workout.name} · {durationMin}min</p>
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
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="How did it feel? PRs? Modifications?" rows={3} style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'DM Sans, sans-serif', resize: 'none', outline: 'none' }} />
        </div>
        <button onClick={handleSave} disabled={saving} style={{ width: '100%', background: 'var(--accent)', color: '#0A0A0A', border: 'none', borderRadius: '12px', padding: '18px', fontSize: '18px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Log & Finish ✓'}
        </button>
      </div>
    </div>
  );
}

// ── Main GymMode ────────────────────────────────────────────────────────────

export default function GymMode({ workout, scheduledWorkoutId }: GymModeProps) {
  const router = useRouter();
  const blocks = (workout.blocks || []).map(normalizeBlock);

  // Build initial set data for all strength exercises
  const initSets = useCallback((): Record<string, SetEntry[]> => {
    const data: Record<string, SetEntry[]> = {};
    for (const block of blocks) {
      if (block.type !== 'strength') continue;
      for (const ex of block.exercises) {
        const count = typeof ex.sets === 'number' && ex.sets > 0 ? ex.sets : 3;
        data[ex.id] = Array.from({ length: count }, () => ({
          reps: ex.reps != null ? String(ex.reps) : '',
          weight: ex.weight_lbs != null ? String(ex.weight_lbs) : '',
          checked: false,
        }));
      }
    }
    return data;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [setData, setSetData] = useState<Record<string, SetEntry[]>>(initSets);
  const [restState, setRestState] = useState<{ exId: string; setIdx: number; seconds: number; max: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const startRef = useRef(Date.now());
  const restRef = useRef<NodeJS.Timeout | null>(null);

  // Screen wake lock
  useEffect(() => {
    let wl: any = null;
    (async () => {
      try { if ('wakeLock' in navigator) wl = await (navigator as any).wakeLock.request('screen'); } catch {}
    })();
    return () => { if (wl) wl.release(); };
  }, []);

  // Elapsed timer
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Rest countdown — restart whenever a new rest begins
  useEffect(() => {
    if (restRef.current) clearInterval(restRef.current);
    if (!restState) return;
    restRef.current = setInterval(() => {
      setRestState(prev => {
        if (!prev) return null;
        if (prev.seconds <= 1) {
          clearInterval(restRef.current!);
          startBeep();
          return null;
        }
        if (prev.seconds <= 4) countdownBeep();
        return { ...prev, seconds: prev.seconds - 1 };
      });
    }, 1000);
    return () => { if (restRef.current) clearInterval(restRef.current); };
  }, [restState?.exId, restState?.setIdx]); // re-run only when a new rest starts

  const updateSet = (exId: string, idx: number, field: 'reps' | 'weight', val: string) => {
    setSetData(prev => ({
      ...prev,
      [exId]: prev[exId].map((s, i) => i === idx ? { ...s, [field]: val } : s),
    }));
  };

  const checkSet = (exId: string, setIdx: number, restSec: number) => {
    beep();
    setSetData(prev => ({
      ...prev,
      [exId]: prev[exId].map((s, i) => i === setIdx ? { ...s, checked: true } : s),
    }));
    const currentSets = setData[exId] || [];
    if (setIdx < currentSets.length - 1) {
      setRestState({ exId, setIdx, seconds: restSec, max: restSec });
    }
  };

  const skipRest = () => {
    if (restRef.current) clearInterval(restRef.current);
    setRestState(null);
  };

  const addSet = (exId: string) => {
    setSetData(prev => {
      const existing = prev[exId] || [];
      const last = existing[existing.length - 1];
      return {
        ...prev,
        [exId]: [...existing, { reps: last?.reps ?? '', weight: last?.weight ?? '', checked: false }],
      };
    });
  };

  const hasAnyExercise = blocks.some(b => b.type === 'strength' && b.exercises.length > 0);
  const hasAnyTimerBlock = blocks.some(b => b.type !== 'strength');

  const inputStyle = (checked: boolean): React.CSSProperties => ({
    background: checked ? 'transparent' : 'var(--bg-elevated)',
    border: checked ? 'none' : '1px solid var(--border)',
    borderRadius: '8px',
    padding: '8px 6px',
    color: checked ? 'var(--text-dim)' : 'var(--text-primary)',
    fontSize: '15px',
    fontFamily: 'Space Grotesk, sans-serif',
    fontWeight: 600,
    width: '100%',
    textAlign: 'center' as const,
    outline: 'none',
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', flexDirection: 'column' }}>
      {/* ── Header ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'var(--bg-base)',
        borderBottom: '1px solid var(--border)',
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '17px', color: 'var(--text-primary)', margin: 0 }}>{workout.name}</p>
          <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '13px', color: 'var(--accent)', margin: '2px 0 0', fontWeight: 600 }}>{fmt(elapsed)}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => { if (confirm('Exit workout? Progress will not be saved.')) router.back(); }}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 14px', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <X size={14} /> Exit
          </button>
          <button
            onClick={() => setShowReview(true)}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: '8px', padding: '8px 16px', color: '#0A0A0A', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '14px' }}
          >
            Finish
          </button>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 120px' }}>

        {/* Empty state */}
        {!hasAnyExercise && !hasAnyTimerBlock && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏃</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '15px', marginBottom: '20px' }}>No structured blocks — go at your own pace.</p>
            <button onClick={() => setShowReview(true)} style={{ background: 'var(--accent)', color: '#0A0A0A', border: 'none', borderRadius: '10px', padding: '14px 32px', fontSize: '16px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', cursor: 'pointer' }}>
              Finish Workout
            </button>
          </div>
        )}

        {/* Strength blocks */}
        {blocks.map(block => {
          if (block.type !== 'strength') return null;
          const restSec = block.config.rest_between_sets_sec || 90;

          return (
            <div key={block.id}>
              {/* Block label — only show if multiple blocks */}
              {blocks.length > 1 && (
                <div style={{ paddingTop: '20px', paddingBottom: '4px' }}>
                  <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{block.label}</span>
                </div>
              )}

              {block.exercises.map(ex => {
                const sets = setData[ex.id] || [];
                const allDone = sets.length > 0 && sets.every(s => s.checked);

                return (
                  <div key={ex.id} style={{ marginBottom: '24px' }}>
                    {/* Exercise header */}
                    <div style={{ paddingTop: '20px', marginBottom: '10px' }}>
                      <h3 style={{
                        fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '17px',
                        color: allDone ? '#22C55E' : 'var(--accent)',
                        margin: 0,
                      }}>
                        {allDone ? '✓ ' : ''}{ex.name}
                      </h3>
                      {ex.notes && <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '3px 0 0', fontFamily: 'DM Sans, sans-serif' }}>{ex.notes}</p>}
                    </div>

                    {/* Column headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 72px 72px 44px', gap: '6px', marginBottom: '6px', padding: '0 2px' }}>
                      <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'center' }}>Set</span>
                      <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Previous</span>
                      <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'center' }}>lbs</span>
                      <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'center' }}>Reps</span>
                      <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'center' }}>✓</span>
                    </div>

                    {/* Set rows */}
                    {sets.map((set, setIdx) => {
                      const isActiveRest = restState?.exId === ex.id && restState?.setIdx === setIdx;
                      return (
                        <div key={setIdx}>
                          <div style={{
                            display: 'grid', gridTemplateColumns: '36px 1fr 72px 72px 44px',
                            gap: '6px', alignItems: 'center',
                            padding: '6px 2px',
                            opacity: set.checked ? 0.45 : 1,
                            transition: 'opacity 0.2s',
                          }}>
                            {/* Set number */}
                            <div style={{ textAlign: 'center', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '14px', color: set.checked ? '#22C55E' : 'var(--text-muted)', background: set.checked ? 'rgba(34,197,94,0.12)' : 'var(--bg-elevated)', borderRadius: '6px', padding: '8px 0' }}>
                              {set.checked ? <Check size={13} style={{ display: 'inline' }} /> : setIdx + 1}
                            </div>

                            {/* Previous */}
                            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', color: 'var(--text-dim)' }}>
                              {set.weight && set.reps ? `${set.weight} lb × ${set.reps}` : '—'}
                            </span>

                            {/* Weight input */}
                            <input
                              type="number"
                              inputMode="decimal"
                              value={set.weight}
                              onChange={e => updateSet(ex.id, setIdx, 'weight', e.target.value)}
                              disabled={set.checked}
                              placeholder="—"
                              style={inputStyle(set.checked)}
                            />

                            {/* Reps input */}
                            <input
                              type="number"
                              inputMode="numeric"
                              value={set.reps}
                              onChange={e => updateSet(ex.id, setIdx, 'reps', e.target.value)}
                              disabled={set.checked}
                              placeholder="—"
                              style={inputStyle(set.checked)}
                            />

                            {/* Check button */}
                            <button
                              onClick={() => !set.checked && checkSet(ex.id, setIdx, restSec)}
                              disabled={set.checked}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: '44px', height: '38px', borderRadius: '8px',
                                background: set.checked ? 'rgba(34,197,94,0.15)' : 'var(--bg-elevated)',
                                border: set.checked ? '1px solid rgba(34,197,94,0.4)' : '1px solid var(--border)',
                                color: set.checked ? '#22C55E' : 'var(--text-muted)',
                                cursor: set.checked ? 'default' : 'pointer',
                              }}
                            >
                              <Check size={16} />
                            </button>
                          </div>

                          {/* Rest timer row — shown directly after the checked set */}
                          {isActiveRest && restState && (
                            <RestRow seconds={restState.seconds} max={restState.max} onSkip={skipRest} />
                          )}
                        </div>
                      );
                    })}

                    {/* Add Set */}
                    <button
                      onClick={() => addSet(ex.id)}
                      style={{
                        width: '100%', marginTop: '8px',
                        background: 'var(--bg-surface)', border: '1px solid var(--border)',
                        borderRadius: '8px', padding: '10px',
                        color: 'var(--text-muted)', cursor: 'pointer',
                        fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '13px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      }}
                    >
                      <Plus size={14} /> Add Set ({fmtRest(restSec)})
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Timer blocks */}
        {hasAnyTimerBlock && (
          <div style={{ marginTop: blocks.some(b => b.type === 'strength') ? '8px' : '20px' }}>
            {blocks.filter(b => b.type !== 'strength').map(block => (
              <TimerBlockCard key={block.id} block={block} onDone={() => {}} />
            ))}
          </div>
        )}
      </div>

      {/* ── Sticky finish bar ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '12px 16px',
        background: 'var(--bg-base)',
        borderTop: '1px solid var(--border)',
      }}>
        <button
          onClick={() => setShowReview(true)}
          style={{
            width: '100%', minHeight: '56px',
            background: 'var(--accent)', color: '#0A0A0A', border: 'none',
            borderRadius: '12px', fontSize: '17px', fontWeight: 700,
            fontFamily: 'Space Grotesk, sans-serif', cursor: 'pointer',
          }}
        >
          Finish Workout
        </button>
      </div>

      {/* Post-workout review */}
      {showReview && (
        <PostWorkoutReview
          workout={workout}
          scheduledWorkoutId={scheduledWorkoutId}
          durationMin={Math.round(elapsed / 60)}
          onFinish={() => router.push('/today')}
        />
      )}
    </div>
  );
}
