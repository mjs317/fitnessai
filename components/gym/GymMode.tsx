'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X, SkipForward, ChevronRight, Plus, Minus, Check } from 'lucide-react';
import { beep, countdownBeep, startBeep, endBeep, restEndBeep } from '@/lib/audio';
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
  workout: {
    id: string;
    name: string;
    blocks: WorkoutBlock[];
  };
  scheduledWorkoutId?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const formatTime = (secs: number): string => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatElapsed = (secs: number): string => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// ── Countdown Ring ─────────────────────────────────────────────────────────

function CountdownRing({ current, max, color = 'var(--accent)', size = 200 }: { current: number; max: number; color?: string; size?: number }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = max > 0 ? current / max : 0;
  const offset = circumference * (1 - progress);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#2A2A2A" strokeWidth={10} />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '56px', color: 'var(--text-primary)', lineHeight: 1 }}>
          {current}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif' }}>sec</span>
      </div>
    </div>
  );
}

// ── Block normalizer (handles imported blocks that lack config/label) ───────

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

// ── Strength Block ─────────────────────────────────────────────────────────

function StrengthBlock({
  block,
  onComplete,
  onNext,
}: {
  block: WorkoutBlock;
  onComplete: (actuals: any) => void;
  onNext: () => void;
}) {
  const exercises = block.exercises;
  const restSec = block.config.rest_between_sets_sec || 90;

  // Track which set we're on per exercise
  const [exIdx, setExIdx] = useState(0);
  const [setIdx, setSetIdx] = useState(0);
  const [phase, setPhase] = useState<'work' | 'rest'>('work');
  const [restTimer, setRestTimer] = useState(restSec);
  const [actuals, setActuals] = useState<Record<string, { sets: number; reps: any; weight_lbs?: number }[]>>({});
  const [editingSet, setEditingSet] = useState<{ reps: string; weight: string } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const ex = exercises[exIdx];
  const totalSets = ex?.sets || 3;
  const isLastSet = setIdx === totalSets - 1;
  const isLastExercise = exIdx === exercises.length - 1;

  // Rest timer
  useEffect(() => {
    if (phase !== 'rest') return;
    timerRef.current = setInterval(() => {
      setRestTimer(prev => {
        if (prev <= 4 && prev > 1) countdownBeep();
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          startBeep();
          setPhase('work');
          // Advance
          if (isLastSet) {
            if (isLastExercise) {
              onComplete(actuals);
            } else {
              setExIdx(e => e + 1);
              setSetIdx(0);
            }
          } else {
            setSetIdx(s => s + 1);
          }
          return restSec;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [phase, restSec, isLastSet, isLastExercise]);

  const handleSetDone = () => {
    // Record actual
    const key = ex.id;
    const setRecord = editingSet
      ? { sets: 1, reps: editingSet.reps, weight_lbs: editingSet.weight ? Number(editingSet.weight) : ex.weight_lbs }
      : { sets: 1, reps: ex.reps, weight_lbs: ex.weight_lbs };

    setActuals(prev => ({
      ...prev,
      [key]: [...(prev[key] || []), setRecord],
    }));
    setEditingSet(null);

    if (isLastSet && isLastExercise) {
      onComplete(actuals);
      return;
    }

    setPhase('rest');
    setRestTimer(restSec);
    startBeep();
  };

  const skipRest = () => {
    clearInterval(timerRef.current!);
    setPhase('work');
    startBeep();
    if (isLastSet) {
      if (isLastExercise) { onComplete(actuals); return; }
      setExIdx(e => e + 1);
      setSetIdx(0);
    } else {
      setSetIdx(s => s + 1);
    }
    setRestTimer(restSec);
  };

  if (!ex) return null;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', gap: '24px' }}>
      {/* Exercise + set counter */}
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '14px', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 8px' }}>
          Set {setIdx + 1} of {totalSets} · Exercise {exIdx + 1}/{exercises.length}
        </p>
        <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '28px', color: 'var(--text-primary)', margin: '0 0 12px' }}>
          {ex.name}
        </h2>
        {ex.superset && <p style={{ fontSize: '12px', color: 'var(--accent)', margin: '0 0 8px', fontFamily: 'Space Grotesk, sans-serif' }}>⚡ SUPERSET</p>}
      </div>

      {/* Weight × Reps display — tap to edit */}
      {phase === 'work' && (
        <>
          <button
            onClick={() => setEditingSet({ reps: String(ex.reps ?? ''), weight: String(ex.weight_lbs ?? '') })}
            style={{
              background: 'var(--bg-elevated)',
              border: '2px solid var(--border)',
              borderRadius: '16px',
              padding: '20px 32px',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '48px', color: 'var(--accent)', lineHeight: 1 }}>
              {editingSet?.weight || ex.weight_lbs || '—'}
              <span style={{ fontSize: '20px', color: 'var(--text-muted)' }}> lbs</span>
            </div>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '24px', color: 'var(--text-primary)', marginTop: '8px' }}>
              {editingSet?.reps || ex.reps || '—'} reps
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '6px' }}>Tap to edit actuals</div>
          </button>

          {ex.notes && <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', fontFamily: 'DM Sans, sans-serif' }}>{ex.notes}</p>}

          <button
            onClick={handleSetDone}
            style={{
              minHeight: '64px', width: '100%', maxWidth: '360px',
              background: 'var(--accent)', color: '#0A0A0A', border: 'none',
              borderRadius: '12px', fontSize: '18px', fontWeight: 700,
              fontFamily: 'Space Grotesk, sans-serif', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            <Check size={20} /> Set Done
          </button>
        </>
      )}

      {phase === 'rest' && (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '14px', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>REST</p>
          <CountdownRing current={restTimer} max={restSec} color="#3B82F6" size={180} />
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            {!isLastExercise && `Next: ${exercises[isLastSet ? exIdx + 1 : exIdx]?.name}`}
          </p>
          <button
            onClick={skipRest}
            style={{
              minHeight: '56px', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: '10px', padding: '0 24px', color: 'var(--text-muted)',
              cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '14px',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}
          >
            <SkipForward size={16} /> Skip Rest
          </button>
        </div>
      )}

      {/* Edit actuals modal */}
      {editingSet && (
        <div
          onClick={() => setEditingSet(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 300, display: 'flex', alignItems: 'flex-end' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', borderRadius: '16px 16px 0 0', padding: '24px', width: '100%', border: '1px solid var(--border)' }}>
            <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', margin: '0 0 16px' }}>Edit This Set</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, marginBottom: '6px', textTransform: 'uppercase' }}>Reps</label>
                <input type="text" value={editingSet.reps} onChange={e => setEditingSet(s => s ? { ...s, reps: e.target.value } : s)} style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', color: 'var(--text-primary)', fontSize: '24px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, width: '100%', textAlign: 'center', outline: 'none' }} inputMode="numeric" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, marginBottom: '6px', textTransform: 'uppercase' }}>Weight (lbs)</label>
                <input type="text" value={editingSet.weight} onChange={e => setEditingSet(s => s ? { ...s, weight: e.target.value } : s)} style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', color: 'var(--accent)', fontSize: '24px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, width: '100%', textAlign: 'center', outline: 'none' }} inputMode="decimal" />
              </div>
            </div>
            <button onClick={() => { /* confirm kept in state */ setEditingSet(null); }} style={{ width: '100%', minHeight: '56px', background: 'var(--accent)', color: '#0A0A0A', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', cursor: 'pointer' }}>
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Timer Block (EMOM / AMRAP / ForTime / Tabata / Rest) ───────────────────

function TimerBlock({
  block,
  onComplete,
}: {
  block: WorkoutBlock;
  onComplete: () => void;
}) {
  const { type, config, exercises } = block;

  // Timer state
  const durationSec = type === 'emom'
    ? (config.duration_min || 12) * 60
    : type === 'amrap'
    ? (config.time_cap_min || 12) * 60
    : type === 'tabata'
    ? ((config.work_sec || 20) + (config.rest_sec || 10)) * (config.rounds || 8)
    : type === 'rest'
    ? (config.duration_min || 3) * 60
    : (config.time_cap_min || 20) * 60; // fortime — count up

  const isCountUp = type === 'fortime';

  const [elapsed, setElapsed] = useState(0);
  const [timer, setTimer] = useState(isCountUp ? 0 : durationSec);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);

  // EMOM: current interval index
  const intervalSec = config.interval_sec || 60;
  const currentInterval = Math.floor(elapsed / intervalSec);
  const currentIntervalElapsed = elapsed % intervalSec;
  const currentIntervalRemaining = intervalSec - currentIntervalElapsed;
  const currentExerciseIdx = exercises.length > 0 ? currentInterval % exercises.length : 0;

  // AMRAP: round counter (manual)
  const [round, setRound] = useState(1);
  const [exerciseIdx, setExerciseIdx] = useState(0);

  // Tabata phases
  const workSec = config.work_sec || 20;
  const restSec = config.rest_sec || 10;
  const cycleLen = workSec + restSec;
  const totalRounds = config.rounds || 8;
  const currentRound = Math.floor(elapsed / cycleLen);
  const phaseElapsed = elapsed % cycleLen;
  const tabataPhase = phaseElapsed < workSec ? 'work' : 'rest';
  const phaseRemaining = tabataPhase === 'work' ? workSec - phaseElapsed : cycleLen - phaseElapsed;

  // ForTime: completed exercises checklist
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [forTimeComplete, setForTimeComplete] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const prevIntervalRef = useRef(-1);
  const prevTabataPhaseRef = useRef<'work' | 'rest'>('work');
  const prevRoundRef = useRef(-1);

  const tick = useCallback(() => {
    setElapsed(e => {
      const next = e + 1;

      // EMOM: beep at new interval
      if (type === 'emom') {
        const prevInt = Math.floor(e / intervalSec);
        const nextInt = Math.floor(next / intervalSec);
        if (nextInt !== prevInt) startBeep();
        const rem = intervalSec - (next % intervalSec);
        if (rem <= 3 && rem > 0) countdownBeep();
      }

      // Tabata: beep on phase switch
      if (type === 'tabata') {
        const prevPhase = (e % cycleLen) < workSec ? 'work' : 'rest';
        const nextPhase = (next % cycleLen) < workSec ? 'work' : 'rest';
        if (prevPhase !== nextPhase) startBeep();
        const rem = nextPhase === 'work' ? workSec - (next % cycleLen) : cycleLen - (next % cycleLen);
        if (rem <= 3 && rem > 0) countdownBeep();
      }

      if (!isCountUp) {
        setTimer(durationSec - next);
        if (durationSec - next <= 0) {
          clearInterval(timerRef.current!);
          endBeep();
          onComplete();
        }
      } else {
        setTimer(next);
      }
      return next;
    });
  }, [type, durationSec, intervalSec, cycleLen, workSec, isCountUp]);

  useEffect(() => {
    if (!running) { clearInterval(timerRef.current!); return; }
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current!);
  }, [running, tick]);

  const handleStart = () => {
    setRunning(true);
    setStarted(true);
    startBeep();
  };

  const handleForTimeComplete = () => {
    clearInterval(timerRef.current!);
    setRunning(false);
    setForTimeComplete(true);
    endBeep();
  };

  const checkForTimeItem = (idx: number) => {
    setCompleted(prev => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
    if (exerciseIdx < exercises.length - 1) setExerciseIdx(exerciseIdx + 1);
  };

  const isTabataComplete = type === 'tabata' && currentRound >= totalRounds;

  // Colors
  const phaseColor = type === 'tabata'
    ? (tabataPhase === 'work' ? '#22C55E' : '#FF4444')
    : 'var(--accent)';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px', gap: '16px' }}>
      {/* Start screen */}
      {!started && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px', textAlign: 'center' }}>
          <div>
            <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '14px', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 8px' }}>{type.toUpperCase()}</p>
            <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '28px', color: 'var(--text-primary)', margin: '0 0 8px' }}>{block.label}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              {type === 'emom' && `${config.duration_min}min · ${intervalSec}s intervals`}
              {type === 'amrap' && `${config.time_cap_min}min time cap`}
              {type === 'fortime' && `${config.time_cap_min ? `${config.time_cap_min}min cap` : 'No cap'}`}
              {type === 'tabata' && `${workSec}s work / ${restSec}s rest · ${totalRounds} rounds`}
              {type === 'rest' && `${config.duration_min}min recovery`}
            </p>
          </div>
          {exercises.map(ex => (
            <div key={ex.id} style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '12px 20px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '16px', color: 'var(--text-primary)' }}>{ex.name}</div>
              {ex.reps && <div style={{ color: 'var(--accent)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '14px', marginTop: '4px' }}>{ex.reps} reps</div>}
            </div>
          ))}
          <button onClick={handleStart} style={{ minHeight: '64px', width: '100%', maxWidth: '320px', background: 'var(--accent)', color: '#0A0A0A', border: 'none', borderRadius: '12px', fontSize: '20px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', cursor: 'pointer' }}>
            Start
          </button>
        </div>
      )}

      {/* Running — EMOM */}
      {started && type === 'emom' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', textAlign: 'center', width: '100%' }}>
          <CountdownRing current={currentIntervalRemaining} max={intervalSec} color="var(--accent)" size={220} />
          <div>
            <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '12px', color: 'var(--text-dim)', margin: '0 0 4px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Interval {currentInterval + 1} of {Math.ceil((config.duration_min || 12) * 60 / intervalSec)}
            </p>
            <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '24px', color: 'var(--text-primary)', margin: 0 }}>
              {exercises[currentExerciseIdx]?.name || '—'}
            </h3>
            {exercises[currentExerciseIdx]?.reps && (
              <p style={{ color: 'var(--accent)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', margin: '4px 0 0' }}>
                {exercises[currentExerciseIdx].reps} reps
              </p>
            )}
          </div>
          {exercises.length > 1 && (
            <p style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
              NEXT: {exercises[(currentExerciseIdx + 1) % exercises.length]?.name}
            </p>
          )}
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Total elapsed: {formatTime(elapsed)}</div>
        </div>
      )}

      {/* Running — AMRAP */}
      {started && type === 'amrap' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', width: '100%' }}>
          {/* Countdown */}
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '64px', color: timer <= 30 ? '#FF4444' : 'var(--accent)', lineHeight: 1 }}>
            {formatTime(timer)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button onClick={() => setRound(r => Math.max(1, r - 1))} style={{ minWidth: '48px', minHeight: '48px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Minus size={18} />
            </button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '48px', color: 'var(--text-primary)', lineHeight: 1 }}>{round}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>rounds</div>
            </div>
            <button onClick={() => setRound(r => r + 1)} style={{ minWidth: '48px', minHeight: '48px', background: 'var(--accent)', border: 'none', borderRadius: '10px', cursor: 'pointer', color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={18} />
            </button>
          </div>
          {/* Exercise list */}
          <div style={{ width: '100%', maxWidth: '360px' }}>
            {exercises.map((ex, idx) => (
              <button
                key={ex.id}
                onClick={() => { setExerciseIdx(idx); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', background: exerciseIdx === idx ? 'rgba(232,255,61,0.1)' : 'var(--bg-elevated)',
                  border: exerciseIdx === idx ? '1px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: '10px', padding: '14px', marginBottom: '6px', cursor: 'pointer',
                  minHeight: '52px',
                }}
              >
                <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '15px', color: exerciseIdx === idx ? 'var(--accent)' : 'var(--text-primary)' }}>{ex.name}</span>
                <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '14px', color: 'var(--text-muted)' }}>{ex.reps}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Running — For Time */}
      {started && type === 'fortime' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', width: '100%' }}>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '64px', color: 'var(--accent)', lineHeight: 1 }}>
            {formatTime(timer)}
          </div>
          {config.time_cap_min && (
            <p style={{ color: 'var(--text-dim)', fontSize: '13px' }}>Cap: {config.time_cap_min}min</p>
          )}
          <div style={{ width: '100%', maxWidth: '360px' }}>
            {exercises.map((ex, idx) => (
              <button
                key={ex.id}
                onClick={() => checkForTimeItem(idx)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', background: completed.has(idx) ? 'rgba(34,197,94,0.1)' : 'var(--bg-elevated)',
                  border: completed.has(idx) ? '1px solid #22C55E33' : '1px solid var(--border)',
                  borderRadius: '10px', padding: '14px', marginBottom: '6px', cursor: 'pointer',
                  minHeight: '52px', opacity: completed.has(idx) ? 0.6 : 1,
                }}
              >
                <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '15px', color: completed.has(idx) ? '#22C55E' : 'var(--text-primary)', textDecoration: completed.has(idx) ? 'line-through' : 'none' }}>{ex.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '14px', color: 'var(--text-muted)' }}>{ex.reps}</span>
                  {completed.has(idx) && <Check size={16} color="#22C55E" />}
                </div>
              </button>
            ))}
          </div>
          {!forTimeComplete && (
            <button onClick={handleForTimeComplete} style={{ minHeight: '64px', width: '100%', maxWidth: '360px', background: 'var(--accent)', color: '#0A0A0A', border: 'none', borderRadius: '12px', fontSize: '18px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', cursor: 'pointer' }}>
              🏁 Done! Stop Timer
            </button>
          )}
          {forTimeComplete && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '28px', color: '#22C55E' }}>✓ Complete!</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Time: {formatTime(elapsed)}</div>
              <button onClick={onComplete} style={{ marginTop: '16px', minHeight: '56px', background: 'var(--accent)', color: '#0A0A0A', border: 'none', borderRadius: '10px', padding: '0 24px', fontSize: '16px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', cursor: 'pointer' }}>
                Next Block →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Running — Tabata */}
      {started && type === 'tabata' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', textAlign: 'center' }}>
          {isTabataComplete ? (
            <div>
              <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '32px', color: '#22C55E' }}>✓ Tabata Complete!</div>
              <button onClick={onComplete} style={{ marginTop: '20px', minHeight: '56px', background: 'var(--accent)', color: '#0A0A0A', border: 'none', borderRadius: '10px', padding: '0 32px', fontSize: '16px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', cursor: 'pointer' }}>
                Next Block →
              </button>
            </div>
          ) : (
            <>
              <div style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontWeight: 900,
                fontSize: '40px',
                letterSpacing: '0.08em',
                color: tabataPhase === 'work' ? '#22C55E' : '#FF4444',
              }}>
                {tabataPhase === 'work' ? 'WORK' : 'REST'}
              </div>
              <CountdownRing
                current={phaseRemaining}
                max={tabataPhase === 'work' ? workSec : restSec}
                color={tabataPhase === 'work' ? '#22C55E' : '#FF4444'}
                size={200}
              />
              <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '18px', color: 'var(--text-primary)', margin: 0 }}>
                {exercises[0]?.name}
              </p>
              <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
                Round {Math.min(currentRound + 1, totalRounds)} of {totalRounds}
              </p>
            </>
          )}
        </div>
      )}

      {/* Running — Rest */}
      {started && type === 'rest' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '14px', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>{block.label}</p>
          <CountdownRing current={timer} max={durationSec} color="#3B82F6" size={220} />
          <button onClick={onComplete} style={{ minHeight: '56px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0 24px', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SkipForward size={16} /> Skip Rest
          </button>
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
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.9)',
      zIndex: 300,
      display: 'flex',
      alignItems: 'flex-end',
    }}>
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
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="How did it feel? PRs? Modifications?"
            rows={3}
            style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'DM Sans, sans-serif', resize: 'none', outline: 'none' }}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', background: 'var(--accent)', color: '#0A0A0A', border: 'none',
            borderRadius: '12px', padding: '18px', fontSize: '18px', fontWeight: 700,
            fontFamily: 'Space Grotesk, sans-serif', cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Log & Finish ✓'}
        </button>
      </div>
    </div>
  );
}

// ── Main GymMode ───────────────────────────────────────────────────────────

export default function GymMode({ workout, scheduledWorkoutId }: GymModeProps) {
  const router = useRouter();
  const [blockIdx, setBlockIdx] = useState(0);
  const [phase, setPhase] = useState<'transition' | 'active' | 'complete'>('transition');
  const [transitionTimer, setTransitionTimer] = useState(3);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const startTimeRef = useRef(Date.now());

  const blocks = (workout.blocks || []).map(normalizeBlock);
  const currentBlock = blocks[blockIdx];

  // Screen wake lock
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (e) { /* not supported */ }
    };
    requestWakeLock();
    return () => { if (wakeLock) wakeLock.release(); };
  }, []);

  // Total elapsed timer
  useEffect(() => {
    const interval = setInterval(() => {
      setTotalElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Transition countdown
  useEffect(() => {
    if (phase !== 'transition') return;
    if (transitionTimer <= 0) { setPhase('active'); return; }
    const t = setTimeout(() => setTransitionTimer(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, transitionTimer]);

  const handleBlockComplete = () => {
    if (blockIdx >= blocks.length - 1) {
      setShowReview(true);
      endBeep();
    } else {
      setBlockIdx(b => b + 1);
      setPhase('transition');
      setTransitionTimer(3);
      startBeep();
    }
  };

  const skipTransition = () => {
    setPhase('active');
    setTransitionTimer(3);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      {/* Top bar — always visible */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 16px 0',
        flexShrink: 0,
      }}>
        <div>
          <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', margin: 0 }}>{workout.name}</p>
          <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '12px', color: 'var(--text-dim)', margin: '2px 0 0' }}>
            Block {blockIdx + 1}/{blocks.length} · {formatElapsed(totalElapsed)}
          </p>
        </div>
        <button
          onClick={() => {
            if (confirm('Exit workout? Progress will not be saved.')) router.back();
          }}
          style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '8px 14px', color: 'var(--text-muted)',
            cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '14px',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <X size={14} /> Exit
        </button>
      </div>

      {/* Block name strip */}
      <div style={{ padding: '8px 16px', flexShrink: 0 }}>
        <span style={{
          background: 'rgba(232,255,61,0.1)',
          border: '1px solid rgba(232,255,61,0.2)',
          borderRadius: '6px',
          padding: '4px 10px',
          fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: 600,
          fontSize: '12px',
          color: 'var(--accent)',
          letterSpacing: '0.04em',
        }}>
          {currentBlock?.type?.toUpperCase()} — {currentBlock?.label}
        </span>
      </div>

      {/* Transition screen */}
      {phase === 'transition' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', textAlign: 'center', padding: '24px' }}>
          <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '14px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Up next</p>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '28px', color: 'var(--text-primary)', margin: 0 }}>{currentBlock?.label}</h2>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '80px', color: 'var(--accent)', lineHeight: 1 }}>
            {transitionTimer}
          </div>
          <button onClick={skipTransition} style={{ minHeight: '56px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0 24px', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SkipForward size={16} /> Skip
          </button>
        </div>
      )}

      {/* Active block */}
      {phase === 'active' && currentBlock && (
        currentBlock.type === 'strength'
          ? <StrengthBlock block={currentBlock} onComplete={handleBlockComplete} onNext={handleBlockComplete} />
          : <TimerBlock block={currentBlock} onComplete={handleBlockComplete} />
      )}

      {/* No structured blocks — freestyle */}
      {phase === 'active' && !currentBlock && !showReview && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px', textAlign: 'center', padding: '24px' }}>
          <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '14px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Free Workout</p>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '64px', color: 'var(--accent)', lineHeight: 1 }}>
            {formatElapsed(totalElapsed)}
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No structured blocks — go at your own pace.</p>
          <button
            onClick={() => setShowReview(true)}
            style={{ minHeight: '64px', width: '100%', maxWidth: '360px', background: 'var(--accent)', color: '#0A0A0A', border: 'none', borderRadius: '12px', fontSize: '18px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', cursor: 'pointer' }}
          >
            Finish Workout
          </button>
        </div>
      )}

      {/* Post-workout review */}
      {showReview && (
        <PostWorkoutReview
          workout={workout}
          scheduledWorkoutId={scheduledWorkoutId}
          durationMin={Math.round(totalElapsed / 60)}
          onFinish={() => router.push('/today')}
        />
      )}
    </div>
  );
}
