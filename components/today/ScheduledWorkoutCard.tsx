'use client';

import { useState } from 'react';
import { Play, Check } from 'lucide-react';
import Link from 'next/link';

interface ScheduledWorkout {
  id: string;
  workout_id: string | null;
  scheduled_date: string;
  status: string;
  source: string;
  external_title: string | null;
  external_description: string | null;
  external_type: string | null;
  workouts?: {
    id: string;
    name: string;
    type: string;
    estimated_duration_min: number | null;
  } | null;
}

interface ScheduledWorkoutCardProps {
  workout: ScheduledWorkout;
  onMarkDone: (id: string, rpe: number, notes: string) => Promise<void>;
}

const sourceLabel: Record<string, { label: string; color: string }> = {
  trainingpeaks: { label: 'TP', color: '#3B82F6' },
  plan: { label: 'AI', color: '#E8FF3D' },
  manual: { label: 'Manual', color: '#888888' },
  ai_generated: { label: 'AI', color: '#E8FF3D' },
};

const typeEmoji: Record<string, string> = {
  run: '🏃',
  bike: '🚴',
  swim: '🏊',
  strength: '💪',
  crossfit: '🏋️',
  hyrox: '⚡',
  mixed: '🔥',
};

export default function ScheduledWorkoutCard({ workout, onMarkDone }: ScheduledWorkoutCardProps) {
  const [showSheet, setShowSheet] = useState(false);
  const [rpe, setRpe] = useState(7);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const name = workout.workouts?.name || workout.external_title || 'Workout';
  const type = workout.workouts?.type || workout.external_type || 'mixed';
  const duration = workout.workouts?.estimated_duration_min;
  const src = sourceLabel[workout.source] || { label: workout.source, color: '#888888' };
  const emoji = typeEmoji[type] || '🏃';
  const isDone = workout.status === 'completed' || workout.status === 'auto-completed';

  const handleSave = async () => {
    setSaving(true);
    await onMarkDone(workout.id, rpe, notes);
    setSaving(false);
    setShowSheet(false);
  };

  return (
    <>
      <div style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${isDone ? '#22C55E33' : 'var(--border)'}`,
        borderRadius: '12px',
        padding: '14px 16px',
        marginBottom: '10px',
        opacity: isDone ? 0.7 : 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>{emoji}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <span style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontWeight: 600,
                fontSize: '15px',
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>{name}</span>
              <span style={{
                background: src.color + '22',
                color: src.color,
                borderRadius: '4px',
                padding: '1px 6px',
                fontSize: '10px',
                fontFamily: 'Space Grotesk, sans-serif',
                fontWeight: 700,
                flexShrink: 0,
              }}>{src.label}</span>
            </div>
            <span style={{
              color: 'var(--text-muted)',
              fontSize: '12px',
              fontFamily: 'DM Sans, sans-serif',
            }}>
              {type.toUpperCase()}{duration ? ` · ~${duration}min` : ''}
              {isDone && <span style={{ color: '#22C55E', marginLeft: '8px' }}>✓ Done</span>}
            </span>
          </div>

          {!isDone && (
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              {workout.workout_id && (
                <Link
                  href={`/workouts/${workout.workout_id}/gym`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'var(--accent)',
                    color: '#0A0A0A',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    fontWeight: 700,
                    fontFamily: 'Space Grotesk, sans-serif',
                    textDecoration: 'none',
                    cursor: 'pointer',
                    minHeight: '36px',
                  }}
                >
                  <Play size={14} />
                  Start
                </Link>
              )}
              <button
                onClick={() => setShowSheet(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  width: '36px',
                  height: '36px',
                  cursor: 'pointer',
                  fontSize: '16px',
                }}
              >
                <Check size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mark Done bottom sheet */}
      {showSheet && (
        <div
          onClick={() => setShowSheet(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-elevated)',
              borderRadius: '16px 16px 0 0',
              padding: '24px',
              width: '100%',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontWeight: 700,
                  fontSize: '18px',
                  color: 'var(--text-primary)',
                  margin: 0,
                }}>{name}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0' }}>Log completed workout</p>
              </div>
              <button
                onClick={() => setShowSheet(false)}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '16px',
                }}
              >×</button>
            </div>

            {/* RPE Slider */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <label style={{
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontWeight: 600,
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>Effort (RPE)</label>
                <span style={{
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontWeight: 700,
                  fontSize: '24px',
                  color: 'var(--accent)',
                  lineHeight: 1,
                }}>{rpe}</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={rpe}
                onChange={e => setRpe(Number(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: 'var(--accent)',
                  height: '6px',
                  cursor: 'pointer',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Easy</span>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Max</span>
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontFamily: 'Space Grotesk, sans-serif',
                fontWeight: 600,
                fontSize: '13px',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '8px',
              }}>Notes (optional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="How did it feel?"
                rows={2}
                style={{
                  width: '100%',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  fontFamily: 'DM Sans, sans-serif',
                  resize: 'none',
                  outline: 'none',
                }}
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%',
                background: 'var(--accent)',
                color: '#0A0A0A',
                border: 'none',
                borderRadius: '10px',
                padding: '16px',
                fontSize: '16px',
                fontWeight: 700,
                fontFamily: 'Space Grotesk, sans-serif',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Log & Done ✓'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
