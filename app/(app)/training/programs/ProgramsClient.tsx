'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ChevronLeft, ChevronDown, ChevronUp, Play, Calendar, Trash2, Power, PowerOff } from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  sport: string;
  weeks: number;
  is_active: boolean;
  plan_data: { startDate?: string; description?: string } | null;
  created_at: string;
}

interface ScheduledWorkout {
  id: string;
  scheduled_date: string;
  status: string;
  external_title: string | null;
  external_type: string | null;
  external_notes: string | null;
  workout_id: string | null;
  workouts: { id: string; name: string; type: string; estimated_duration_min: number | null } | null;
}

const typeEmoji: Record<string, string> = {
  run: '🏃', bike: '🚴', swim: '🏊', strength: '💪', crossfit: '🏋️',
  hyrox: '⚡', mixed: '🔥', rest: '😴', hiit: '🔥', active_recovery: '🧘',
};

const statusStyle: Record<string, string> = {
  pending: 'var(--text-dim)',
  completed: '#22C55E',
  'auto-completed': '#22C55E',
  skipped: '#FF4444',
};

export default function ProgramsClient({ initialPlans }: { initialPlans: Plan[] }) {
  const router = useRouter();
  const [plans, setPlans] = useState(initialPlans);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [workoutsMap, setWorkoutsMap] = useState<Record<string, ScheduledWorkout[]>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [newStartDate, setNewStartDate] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchWorkouts = useCallback(async (planId: string) => {
    if (workoutsMap[planId]) return;
    setLoading(planId);
    const res = await fetch(`/api/programs/${planId}`);
    if (res.ok) {
      const data = await res.json();
      setWorkoutsMap(m => ({ ...m, [planId]: data.scheduledWorkouts }));
    }
    setLoading(null);
  }, [workoutsMap]);

  const toggleExpand = async (planId: string) => {
    if (expanded === planId) {
      setExpanded(null);
    } else {
      setExpanded(planId);
      await fetchWorkouts(planId);
    }
  };

  const setActive = async (planId: string, active: boolean) => {
    setLoading(planId);
    await fetch(`/api/programs/${planId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: active ? 'set_active' : 'deactivate' }),
    });
    setPlans(ps => ps.map(p => ({
      ...p,
      is_active: active ? p.id === planId : (p.id === planId ? false : p.is_active),
    })));
    setLoading(null);
  };

  const doReschedule = async (planId: string) => {
    if (!newStartDate) return;
    setLoading(planId);
    await fetch(`/api/programs/${planId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reschedule', newStartDate }),
    });
    // Refresh workouts for this plan
    setWorkoutsMap(m => { const n = { ...m }; delete n[planId]; return n; });
    setRescheduleId(null);
    setNewStartDate('');
    setExpanded(planId);
    await fetchWorkouts(planId);
    setLoading(null);
  };

  const deletePlan = async (planId: string) => {
    setLoading(planId);
    await fetch(`/api/programs/${planId}`, { method: 'DELETE' });
    setPlans(ps => ps.filter(p => p.id !== planId));
    setConfirmDelete(null);
    setLoading(null);
  };

  return (
    <div style={{ padding: '20px 16px', maxWidth: '860px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Link href="/training" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', textDecoration: 'none' }}>
          <ChevronLeft size={20} />
        </Link>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '26px', color: 'var(--text-primary)', margin: 0 }}>
          My Programs
        </h1>
      </div>

      {plans.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
          <p style={{ fontSize: '16px', marginBottom: '20px' }}>No programs yet.</p>
          <Link href="/training" style={{ background: 'var(--accent)', color: '#0A0A0A', borderRadius: '8px', padding: '10px 20px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, textDecoration: 'none' }}>
            Import or Generate One
          </Link>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {plans.map(plan => {
          const isExpanded = expanded === plan.id;
          const sws = workoutsMap[plan.id] ?? [];
          const isLoading = loading === plan.id;
          const startDate = plan.plan_data?.startDate;
          const pending = sws.filter(w => w.status === 'pending').length;
          const done = sws.filter(w => w.status === 'completed' || w.status === 'auto-completed').length;

          return (
            <div key={plan.id} style={{
              background: 'var(--bg-surface)',
              border: plan.is_active ? '1px solid rgba(232,255,61,0.35)' : '1px solid var(--border)',
              borderRadius: '12px',
              overflow: 'hidden',
            }}>
              {/* Plan header */}
              <div style={{ padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                      {plan.is_active && (
                        <span style={{ background: 'rgba(232,255,61,0.15)', color: 'var(--accent)', borderRadius: '4px', padding: '2px 8px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Active
                        </span>
                      )}
                      <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)' }}>
                        {plan.name}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'DM Sans, sans-serif' }}>
                      {plan.sport} · {plan.weeks}w
                      {startDate && <> · Starts {format(parseISO(startDate), 'MMM d, yyyy')}</>}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button
                      onClick={() => setActive(plan.id, !plan.is_active)}
                      disabled={isLoading}
                      title={plan.is_active ? 'Deactivate' : 'Set Active'}
                      style={{
                        background: plan.is_active ? 'rgba(232,255,61,0.15)' : 'var(--bg-elevated)',
                        border: plan.is_active ? '1px solid rgba(232,255,61,0.4)' : '1px solid var(--border)',
                        borderRadius: '8px', padding: '8px', cursor: 'pointer',
                        color: plan.is_active ? 'var(--accent)' : 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: isLoading ? 0.5 : 1,
                      }}
                    >
                      {plan.is_active ? <PowerOff size={15} /> : <Power size={15} />}
                    </button>
                    <button
                      onClick={() => { setRescheduleId(plan.id); setNewStartDate(startDate ?? ''); }}
                      title="Reschedule"
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Calendar size={15} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(plan.id)}
                      title="Delete"
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: '#FF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 size={15} />
                    </button>
                    <button
                      onClick={() => toggleExpand(plan.id)}
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                  </div>
                </div>

                {/* Progress bar (if workouts loaded) */}
                {sws.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif' }}>{done}/{sws.length} completed</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif' }}>{pending} pending</span>
                    </div>
                    <div style={{ height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${sws.length > 0 ? (done / sws.length) * 100 : 0}%`, background: 'var(--accent)', borderRadius: '2px', transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Expanded workout list */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
                  {isLoading && <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '12px 0' }}>Loading…</p>}

                  {!isLoading && sws.length === 0 && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '12px 0' }}>No workouts in this plan.</p>
                  )}

                  {!isLoading && sws.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '420px', overflowY: 'auto' }}>
                      {sws.map(sw => {
                        const name = sw.workouts?.name || sw.external_title || 'Workout';
                        const type = sw.workouts?.type || sw.external_type || 'mixed';
                        const workoutId = sw.workouts?.id || sw.workout_id;
                        const statusColor = statusStyle[sw.status] || 'var(--text-dim)';

                        return (
                          <div key={sw.id} style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                            borderRadius: '8px', padding: '10px 12px',
                          }}>
                            <span style={{ fontSize: '18px', flexShrink: 0 }}>{typeEmoji[type] || '🏃'}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {name}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {format(parseISO(sw.scheduled_date), 'EEE, MMM d')}
                                {sw.workouts?.estimated_duration_min && <span> · ~{sw.workouts.estimated_duration_min}min</span>}
                                {sw.status !== 'pending' && <span style={{ color: statusColor, marginLeft: '6px' }}>· {sw.status}</span>}
                              </div>
                            </div>
                            {/* Start ad-hoc button */}
                            {workoutId && sw.status === 'pending' && (
                              <Link
                                href={`/workouts/${workoutId}/gym?scheduledId=${sw.id}`}
                                style={{
                                  background: 'var(--accent)', color: '#0A0A0A',
                                  borderRadius: '6px', padding: '6px 10px',
                                  display: 'flex', alignItems: 'center', gap: '4px',
                                  fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '12px',
                                  textDecoration: 'none', flexShrink: 0,
                                }}
                              >
                                <Play size={12} fill="#0A0A0A" /> Start
                              </Link>
                            )}
                            {sw.status === 'completed' || sw.status === 'auto-completed' ? (
                              <span style={{ fontSize: '18px' }}>✓</span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Reschedule modal */}
      {rescheduleId && (
        <div
          onClick={() => setRescheduleId(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-elevated)', borderRadius: '16px 16px 0 0', padding: '28px', width: '100%', border: '1px solid var(--border)' }}
          >
            <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)', margin: '0 0 6px' }}>
              Reschedule Program
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: 'DM Sans, sans-serif' }}>
              Pick a new start date. All workouts will shift by the same number of days.
            </p>
            <input
              type="date"
              value={newStartDate}
              onChange={e => setNewStartDate(e.target.value)}
              style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', color: 'var(--text-primary)', fontSize: '16px', fontFamily: 'Space Grotesk, sans-serif', outline: 'none', marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setRescheduleId(null)}
                style={{ flex: 1, minHeight: '52px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '15px' }}
              >
                Cancel
              </button>
              <button
                onClick={() => doReschedule(rescheduleId)}
                disabled={!newStartDate || loading === rescheduleId}
                style={{ flex: 2, minHeight: '52px', background: 'var(--accent)', color: '#0A0A0A', border: 'none', borderRadius: '10px', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '15px', opacity: !newStartDate ? 0.5 : 1 }}
              >
                {loading === rescheduleId ? 'Saving…' : 'Apply Reschedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div
          onClick={() => setConfirmDelete(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-elevated)', borderRadius: '16px 16px 0 0', padding: '28px', width: '100%', border: '1px solid var(--border)' }}
          >
            <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)', margin: '0 0 8px' }}>Delete Program?</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 24px', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5 }}>
              This will permanently delete the plan and all its scheduled workouts. Completed logs are kept.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, minHeight: '52px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '15px' }}
              >
                Cancel
              </button>
              <button
                onClick={() => deletePlan(confirmDelete)}
                disabled={loading === confirmDelete}
                style={{ flex: 2, minHeight: '52px', background: '#FF4444', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '15px' }}
              >
                {loading === confirmDelete ? 'Deleting…' : 'Delete Program'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
