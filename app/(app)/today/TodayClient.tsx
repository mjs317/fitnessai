'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import MetricRing from '@/components/today/MetricRing';
import AIBrief from '@/components/today/AIBrief';
import ScheduledWorkoutCard from '@/components/today/ScheduledWorkoutCard';
import QuickMealLog from '@/components/today/QuickMealLog';
import { createClient } from '@/lib/supabase/client';

interface HealthMetrics {
  hrv: number | null;
  sleep_score: number | null;
  body_battery_start: number | null;
  resting_hr: number | null;
  weight_lbs: number | null;
  date: string;
}

interface NutritionTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface UserGoals {
  daily_calories: number;
  daily_protein_g: number;
  daily_carbs_g: number;
  daily_fat_g: number;
}

interface TodayClientProps {
  initialMetrics: HealthMetrics | null;
  initialWorkouts: any[];
  initialMealTemplates: any[];
  initialNutrition: NutritionTotals;
  initialAIBrief: { verdict: 'PUSH' | 'MAINTAIN' | 'RECOVER' | null; content: string | null } | null;
  goals: UserGoals;
}

function GettingStartedBanner() {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--accent)',
      borderRadius: '12px',
      padding: '20px',
      marginBottom: '16px',
    }}>
      <p style={{
        fontFamily: 'Space Grotesk, sans-serif',
        fontWeight: 700,
        fontSize: '15px',
        color: 'var(--text-primary)',
        margin: '0 0 14px',
      }}>👋 Welcome! Connect your devices to get started</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        {[
          'Go to Settings → connect Garmin or Withings',
          'Run your first sync',
          'Your metrics will appear here automatically each morning',
        ].map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{
              width: '20px', height: '20px', borderRadius: '50%',
              border: '1.5px solid var(--border)',
              flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', color: 'var(--text-dim)',
              fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700,
            }}>{i + 1}</div>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{step}</span>
          </div>
        ))}
      </div>
      <a href="/settings" style={{
        color: 'var(--accent)',
        fontSize: '13px',
        fontFamily: 'Space Grotesk, sans-serif',
        fontWeight: 700,
        textDecoration: 'none',
      }}>Go to Settings →</a>
    </div>
  );
}

function MacroBar({ label, current, goal, color }: { label: string; current: number; goal: number; color: string }) {
  const pct = Math.min((current / goal) * 100, 100);
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{
          fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: 500,
          fontSize: '12px',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>{label}</span>
        <span style={{
          fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: 600,
          fontSize: '12px',
          color: 'var(--text-primary)',
        }}>{Math.round(current)}<span style={{ color: 'var(--text-dim)' }}>/{goal}</span></span>
      </div>
      <div style={{
        height: '6px',
        background: 'var(--bg-elevated)',
        borderRadius: '3px',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: '3px',
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

export default function TodayClient({
  initialMetrics,
  initialWorkouts,
  initialMealTemplates,
  initialNutrition,
  initialAIBrief,
  goals,
}: TodayClientProps) {
  const [metrics, setMetrics] = useState(initialMetrics);
  const [workouts, setWorkouts] = useState(initialWorkouts);
  const [nutrition, setNutrition] = useState(initialNutrition);
  const [aiBrief, setAIBrief] = useState(initialAIBrief);
  const [aiLoading, setAiLoading] = useState(!initialAIBrief);

  const today = format(new Date(), 'EEEE, MMM d');

  // Fetch AI brief if not cached
  useEffect(() => {
    if (!initialAIBrief) {
      setAiLoading(true);
      fetch('/api/ai/daily-brief')
        .then(r => r.json())
        .then(data => {
          if (data.verdict) {
            setAIBrief({ verdict: data.verdict, content: data.content });
          }
          setAiLoading(false);
        })
        .catch(() => setAiLoading(false));
    }
  }, [initialAIBrief]);

  const supabase = createClient();

  const handleMarkDone = async (scheduledWorkoutId: string, rpe: number, notes: string) => {
    // Optimistic update
    setWorkouts(prev =>
      prev.map(w =>
        w.id === scheduledWorkoutId ? { ...w, status: 'completed' } : w
      )
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('workout_logs').insert({
      user_id: user.id,
      scheduled_workout_id: scheduledWorkoutId,
      rpe_score: rpe,
      notes: notes || null,
      completed_at: new Date().toISOString(),
    });

    await supabase
      .from('scheduled_workouts')
      .update({ status: 'completed' })
      .eq('id', scheduledWorkoutId);
  };

  const handleLogMeal = async (template: any) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];

    // Optimistic update
    setNutrition(prev => ({
      calories: prev.calories + (template.calories || 0),
      protein_g: prev.protein_g + (template.protein_g || 0),
      carbs_g: prev.carbs_g + (template.carbs_g || 0),
      fat_g: prev.fat_g + (template.fat_g || 0),
    }));

    await supabase.from('meal_logs').insert({
      user_id: user.id,
      date: today,
      meal_template_id: template.id,
      meal_name: template.name,
      calories: template.calories,
      protein_g: template.protein_g,
      carbs_g: template.carbs_g,
      fat_g: template.fat_g,
    });
  };

  const pendingWorkouts = workouts.filter(w => w.status === 'pending');
  const completedWorkouts = workouts.filter(w => w.status === 'completed' || w.status === 'auto-completed');

  const isNewUser =
    !metrics &&
    workouts.length === 0 &&
    nutrition.calories === 0 &&
    nutrition.protein_g === 0;

  return (
    <div style={{ padding: '20px 16px', maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{
          fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: 500,
          fontSize: '14px',
          color: 'var(--text-muted)',
          margin: '0 0 4px',
          letterSpacing: '0.02em',
        }}>Good morning</p>
        <h1 style={{
          fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: 700,
          fontSize: '26px',
          color: 'var(--text-primary)',
          margin: 0,
        }}>{today}</h1>
      </div>

      {isNewUser && <GettingStartedBanner />}

      {/* Metric Rings */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '20px 16px',
        marginBottom: '16px',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-around',
          marginBottom: '16px',
        }}>
          <MetricRing
            label="HRV"
            value={metrics?.hrv ?? null}
            max={100}
            unit="ms"
            thresholds={{ green: 55, yellow: 40 }}
          />
          <MetricRing
            label="Sleep"
            value={metrics?.sleep_score ?? null}
            max={100}
            unit="/100"
            thresholds={{ green: 80, yellow: 65 }}
          />
          <MetricRing
            label="Body Battery"
            value={metrics?.body_battery_start ?? null}
            max={100}
            unit="/100"
            thresholds={{ green: 60, yellow: 40 }}
          />
        </div>
        {/* Secondary metrics */}
        <div style={{
          display: 'flex',
          gap: '12px',
          paddingTop: '12px',
          borderTop: '1px solid var(--border)',
        }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontWeight: 700,
              fontSize: '20px',
              color: 'var(--text-primary)',
            }}>
              {metrics?.weight_lbs ? `${metrics.weight_lbs.toFixed(1)}` : '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif' }}>LBS</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
            <div style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontWeight: 700,
              fontSize: '20px',
              color: 'var(--text-primary)',
            }}>
              {metrics?.resting_hr ?? '—'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif' }}>RHR</div>
          </div>
          {metrics && (
            <div style={{ flex: 1, textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
              <div style={{
                fontFamily: 'Space Grotesk, sans-serif',
                fontWeight: 500,
                fontSize: '11px',
                color: 'var(--text-dim)',
              }}>
                Last sync
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif' }}>
                {format(new Date(metrics.date), 'MMM d')}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Brief */}
      <div style={{ marginBottom: '8px' }}>
        <p style={{
          fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: 600,
          fontSize: '11px',
          color: 'var(--text-dim)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: '8px',
        }}>AI COACH</p>
        <AIBrief
          verdict={aiBrief?.verdict ?? null}
          content={aiBrief?.content ?? null}
          isLoading={aiLoading}
          date={new Date().toISOString().split('T')[0]}
        />
      </div>

      {/* Today's Workouts */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{
          fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: 600,
          fontSize: '11px',
          color: 'var(--text-dim)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: '8px',
        }}>TODAY'S WORKOUTS</p>

        {workouts.length === 0 && (
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px dashed var(--border)',
            borderRadius: '12px',
            padding: '20px',
            textAlign: 'center',
          }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '0 0 12px' }}>
              No workouts scheduled for today.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <a href="/workouts" style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '8px 14px',
                color: 'var(--text-muted)',
                fontSize: '13px',
                textDecoration: 'none',
                fontFamily: 'Space Grotesk, sans-serif',
                fontWeight: 500,
              }}>Browse Library</a>
              <a href="/workouts/new" style={{
                background: 'var(--accent)',
                borderRadius: '8px',
                padding: '8px 14px',
                color: '#0A0A0A',
                fontSize: '13px',
                textDecoration: 'none',
                fontFamily: 'Space Grotesk, sans-serif',
                fontWeight: 700,
              }}>Create Workout</a>
            </div>
          </div>
        )}

        {pendingWorkouts.map(w => (
          <ScheduledWorkoutCard key={w.id} workout={w} onMarkDone={handleMarkDone} />
        ))}
        {completedWorkouts.map(w => (
          <ScheduledWorkoutCard key={w.id} workout={w} onMarkDone={handleMarkDone} />
        ))}
      </div>

      {/* Nutrition */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{
          fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: 600,
          fontSize: '11px',
          color: 'var(--text-dim)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: '8px',
        }}>NUTRITION TODAY</p>
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '16px',
        }}>
          <MacroBar label="Protein" current={nutrition.protein_g} goal={goals.daily_protein_g} color="#22C55E" />
          <MacroBar label="Carbs" current={nutrition.carbs_g} goal={goals.daily_carbs_g} color="#3B82F6" />
          <MacroBar label="Calories" current={nutrition.calories} goal={goals.daily_calories} color="var(--accent)" />
          <QuickMealLog templates={initialMealTemplates} onLog={handleLogMeal} />
        </div>
      </div>
    </div>
  );
}
