'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, addDays, parseISO, isSameDay, isToday, isPast } from 'date-fns';
import { ChevronRight, Plus, Calendar, List, CheckCircle, Upload } from 'lucide-react';
import ProgramImportModal from '@/components/programs/ProgramImportModal';

interface ScheduledWorkout {
  id: string;
  scheduled_date: string;
  status: string;
  source: string;
  external_title: string | null;
  external_type: string | null;
  external_description: string | null;
  garmin_workout_id: string | null;
  workouts: { id: string; name: string; type: string; estimated_duration_min: number | null } | null;
}

interface Plan {
  id: string;
  name: string;
  sport: string;
  race_distance: string;
  race_date: string;
  is_active: boolean;
}

interface TrainingClientProps {
  initialScheduled: ScheduledWorkout[];
  plans: Plan[];
  todayStr: string;
  weekStartStr: string;
}

const sourceColors: Record<string, string> = {
  trainingpeaks: '#3B82F6',
  plan: '#E8FF3D',
  ai_generated: '#E8FF3D',
  manual: '#888888',
};

const statusColors: Record<string, { color: string; label: string }> = {
  pending: { color: 'var(--text-dim)', label: '' },
  completed: { color: '#22C55E', label: '✓' },
  'auto-completed': { color: '#22C55E', label: '✓ Auto' },
  skipped: { color: '#FF4444', label: '✗' },
};

const typeEmoji: Record<string, string> = {
  run: '🏃', bike: '🚴', swim: '🏊', strength: '💪', crossfit: '🏋️', hyrox: '⚡', mixed: '🔥', rest: '😴',
};

function getInitialWeekOffset(scheduled: ScheduledWorkout[], weekStartStr: string, todayStr: string): number {
  // If there are workouts in the first 2 weeks, start at 0
  const base = parseISO(weekStartStr);
  const in2Weeks = scheduled.some(w => {
    const d = w.scheduled_date;
    return d >= weekStartStr && d <= format(addDays(base, 13), 'yyyy-MM-dd');
  });
  if (in2Weeks) return 0;

  // Find the week offset of the first upcoming workout
  const upcoming = scheduled
    .filter(w => w.scheduled_date >= todayStr)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  if (!upcoming.length) return 0;

  const firstDate = parseISO(upcoming[0].scheduled_date);
  const diffMs = firstDate.getTime() - base.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  return Math.max(0, Math.floor(diffDays / 7));
}

export default function TrainingClient({ initialScheduled, plans, todayStr, weekStartStr }: TrainingClientProps) {
  const router = useRouter();
  const [view, setView] = useState<'week' | 'list'>('week');
  const [selected, setSelected] = useState<ScheduledWorkout | null>(null);
  const [scheduled, setScheduled] = useState(initialScheduled);
  const [showImportModal, setShowImportModal] = useState(false);
  const [weekOffset, setWeekOffset] = useState(() => getInitialWeekOffset(initialScheduled, weekStartStr, todayStr));

  // 14 days starting from the viewed week
  const viewStart = addDays(parseISO(weekStartStr), weekOffset * 7);
  const weekDays = Array.from({ length: 14 }, (_, i) => addDays(viewStart, i));
  const viewStartStr = format(viewStart, 'yyyy-MM-dd');
  const viewEndStr = format(addDays(viewStart, 13), 'yyyy-MM-dd');
  const canGoBack = weekOffset > 0;

  const getWorkoutsForDay = (date: Date) =>
    scheduled.filter(w => w.scheduled_date === format(date, 'yyyy-MM-dd'));

  const getName = (w: ScheduledWorkout) => w.workouts?.name || w.external_title || 'Workout';
  const getType = (w: ScheduledWorkout) => w.workouts?.type || w.external_type || 'mixed';

  return (
    <div style={{ padding: '20px 16px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '26px', color: 'var(--text-primary)', margin: 0 }}>Training</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setView('week')} style={{ background: view === 'week' ? 'var(--accent)' : 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', color: view === 'week' ? '#0A0A0A' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Calendar size={14} />
          </button>
          <button onClick={() => setView('list')} style={{ background: view === 'list' ? 'var(--accent)' : 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', color: view === 'list' ? '#0A0A0A' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <List size={14} />
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <Upload size={14} /> Import
          </button>
          <Link href="/training/generate" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--accent)', color: '#0A0A0A', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, textDecoration: 'none' }}>
            <Plus size={14} /> Plan
          </Link>
        </div>
      </div>

      {/* Active plans */}
      {plans.filter(p => p.is_active).map(plan => (
        <div key={plan.id} style={{ background: 'rgba(232,255,61,0.08)', border: '1px solid rgba(232,255,61,0.2)', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '13px', color: 'var(--accent)' }}>Active Plan: </span>
            <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '13px', color: 'var(--text-primary)' }}>{plan.name}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>Race: {plan.race_date}</span>
          </div>
          <ChevronRight size={14} style={{ color: 'var(--text-dim)' }} />
        </div>
      ))}

      {/* Week navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <button
          onClick={() => setWeekOffset(o => Math.max(0, o - 1))}
          disabled={!canGoBack}
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', color: canGoBack ? 'var(--text-primary)' : 'var(--text-muted)', cursor: canGoBack ? 'pointer' : 'default', fontFamily: 'Space Grotesk, sans-serif', fontSize: '13px', opacity: canGoBack ? 1 : 0.4 }}
        >
          ← Prev
        </button>
        <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '13px', color: 'var(--text-muted)' }}>
          {format(viewStart, 'MMM d')} – {format(addDays(viewStart, 13), 'MMM d, yyyy')}
          {weekOffset === 0 && <span style={{ color: 'var(--accent)', marginLeft: '6px' }}>· This week</span>}
        </span>
        <button
          onClick={() => setWeekOffset(o => o + 1)}
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontSize: '13px' }}
        >
          Next →
        </button>
      </div>

      {/* Week view */}
      {view === 'week' && (
        <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(110px, 1fr))', gap: '8px', minWidth: '770px' }}>
            {weekDays.slice(0, 7).map(day => {
              const dayWorkouts = getWorkoutsForDay(day);
              const isCurrentDay = format(day, 'yyyy-MM-dd') === todayStr;
              return (
                <div key={day.toISOString()} style={{
                  background: isCurrentDay ? 'rgba(232,255,61,0.06)' : 'var(--bg-surface)',
                  border: isCurrentDay ? '1px solid rgba(232,255,61,0.3)' : '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '10px',
                  minHeight: '100px',
                }}>
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: isCurrentDay ? 700 : 500, fontSize: '11px', color: isCurrentDay ? 'var(--accent)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {format(day, 'EEE')}
                    </div>
                    <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', color: isCurrentDay ? 'var(--accent)' : 'var(--text-primary)' }}>
                      {format(day, 'd')}
                    </div>
                  </div>
                  {dayWorkouts.map(w => (
                    <button
                      key={w.id}
                      onClick={() => setSelected(w)}
                      style={{
                        display: 'block', width: '100%', background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)', borderRadius: '6px',
                        padding: '6px 8px', marginBottom: '4px', cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '14px' }}>{typeEmoji[getType(w)] || '🏃'}</span>
                        <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '11px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {getName(w)}
                        </span>
                      </div>
                      {w.status !== 'pending' && (
                        <span style={{ fontSize: '10px', color: statusColors[w.status]?.color, fontFamily: 'Space Grotesk, sans-serif' }}>
                          {statusColors[w.status]?.label}
                        </span>
                      )}
                    </button>
                  ))}
                  {dayWorkouts.length === 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center', marginTop: '12px' }}>—</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Week 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(110px, 1fr))', gap: '8px', minWidth: '770px', marginTop: '8px' }}>
            {weekDays.slice(7, 14).map(day => {
              const dayWorkouts = getWorkoutsForDay(day);
              return (
                <div key={day.toISOString()} style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '10px',
                  minHeight: '100px',
                  opacity: 0.8,
                }}>
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{format(day, 'EEE')}</div>
                    <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)' }}>{format(day, 'd')}</div>
                  </div>
                  {dayWorkouts.map(w => (
                    <button key={w.id} onClick={() => setSelected(w)} style={{ display: 'block', width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 8px', marginBottom: '4px', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '11px', color: 'var(--text-primary)' }}>{typeEmoji[getType(w)] || '🏃'} {getName(w)}</span>
                    </button>
                  ))}
                  {dayWorkouts.length === 0 && <div style={{ fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center', marginTop: '12px' }}>—</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div>
          {weekDays.map(day => {
            const dayWorkouts = getWorkoutsForDay(day);
            if (dayWorkouts.length === 0) return null;
            const isCurrentDay = format(day, 'yyyy-MM-dd') === todayStr;
            return (
              <div key={day.toISOString()} style={{ marginBottom: '16px' }}>
                <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '12px', color: isCurrentDay ? 'var(--accent)' : 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 6px' }}>
                  {isCurrentDay ? 'TODAY — ' : ''}{format(day, 'EEE, MMM d')}
                </p>
                {dayWorkouts.map(w => (
                  <button key={w.id} onClick={() => setSelected(w)} style={{ display: 'flex', alignItems: 'center', width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', marginBottom: '6px', cursor: 'pointer', textAlign: 'left', gap: '10px' }}>
                    <span style={{ fontSize: '22px' }}>{typeEmoji[getType(w)] || '🏃'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{getName(w)}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        <span style={{ background: (sourceColors[w.source] || '#888') + '22', color: sourceColors[w.source] || '#888', borderRadius: '4px', padding: '1px 6px', fontSize: '10px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700 }}>{w.source.toUpperCase()}</span>
                        {w.workouts?.estimated_duration_min && <span style={{ marginLeft: '6px' }}>~{w.workouts.estimated_duration_min}min</span>}
                        {w.status !== 'pending' && <span style={{ marginLeft: '6px', color: statusColors[w.status]?.color }}>{statusColors[w.status]?.label}</span>}
                      </div>
                    </div>
                    <ChevronRight size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            );
          })}
          {weekDays.every(d => getWorkoutsForDay(d).length === 0) && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📅</div>
              <p style={{ fontSize: '15px', marginBottom: '16px' }}>No workouts scheduled yet.</p>
              <Link href="/training/generate" style={{ background: 'var(--accent)', color: '#0A0A0A', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, textDecoration: 'none' }}>
                Generate a Training Plan
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Program import modal */}
      <ProgramImportModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => router.refresh()}
        hasActivePlan={plans.some(p => p.is_active)}
      />

      {/* Workout detail drawer */}
      {selected && (
        <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', borderRadius: '16px 16px 0 0', padding: '24px', width: '100%', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '20px', color: 'var(--text-primary)', margin: '0 0 4px' }}>{getName(selected)}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>{format(parseISO(selected.scheduled_date), 'EEEE, MMM d')} · {selected.source.toUpperCase()}</p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px' }}>×</button>
            </div>

            {selected.external_description && (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                {selected.external_description.slice(0, 400)}{selected.external_description.length > 400 ? '...' : ''}
              </p>
            )}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {selected.workouts?.id && selected.status === 'pending' && (
                <Link href={`/workouts/${selected.workouts.id}/gym?scheduledId=${selected.id}`} style={{ flex: 1, minHeight: '52px', background: 'var(--accent)', color: '#0A0A0A', borderRadius: '10px', padding: '0 16px', fontSize: '15px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  Start Workout
                </Link>
              )}
              {selected.status === 'completed' || selected.status === 'auto-completed' ? (
                <div style={{ flex: 1, background: 'rgba(34,197,94,0.1)', border: '1px solid #22C55E33', borderRadius: '10px', padding: '14px 16px', textAlign: 'center', color: '#22C55E', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '14px' }}>
                  ✓ {selected.status === 'auto-completed' ? 'Auto-completed via Garmin' : 'Completed'}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
