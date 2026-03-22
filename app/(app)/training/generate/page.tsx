'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const GOALS = [
  { value: 'strength', label: 'Build Strength' },
  { value: 'muscle', label: 'Build Muscle (Hypertrophy)' },
  { value: 'crossfit', label: 'CrossFit / MetCon' },
  { value: 'hyrox', label: 'Hyrox' },
  { value: 'fat_loss', label: 'Fat Loss + Conditioning' },
  { value: 'general', label: 'General Fitness' },
];

const EQUIPMENT_OPTIONS = [
  { value: 'full gym', label: 'Full Gym (barbell, dumbbells, machines)' },
  { value: 'crossfit gym', label: 'CrossFit Box' },
  { value: 'dumbbells only', label: 'Dumbbells Only' },
  { value: 'bodyweight', label: 'Bodyweight / Minimal Equipment' },
];

export default function GeneratePlanPage() {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({
    goal: 'strength',
    weeks: 4,
    training_days: ['monday', 'tuesday', 'thursday', 'friday'],
    fitness_level: 'intermediate',
    equipment: 'full gym',
  });
  const [loading, setLoading] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleDay = (day: string) => {
    setForm(f => ({
      ...f,
      training_days: f.training_days.includes(day)
        ? f.training_days.filter(d => d !== day)
        : [...f.training_days, day],
    }));
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setGeneratedPlan(null);
    try {
      const res = await fetch('/api/ai/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setGeneratedPlan(data.plan);
    } catch (err: any) {
      setError('Generation failed: ' + err.message);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!generatedPlan) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    // Deactivate other plans
    await supabase.from('training_plans').update({ is_active: false }).eq('user_id', user.id).eq('is_active', true);

    // Save plan
    const { data: plan, error: planErr } = await supabase.from('training_plans').insert({
      user_id: user.id,
      name: generatedPlan.name,
      sport: generatedPlan.sport || 'strength',
      weeks: generatedPlan.total_weeks || form.weeks,
      is_active: true,
      plan_data: generatedPlan.plan_data,
    }).select().single();

    if (planErr || !plan) { setError('Save failed: ' + planErr?.message); setSaving(false); return; }

    // Schedule first 2 weeks into calendar
    const planWeeks = generatedPlan.plan_data?.weeks?.slice(0, 2) || [];
    const dayMap: Record<string, number> = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };
    const today = new Date();

    const rows = [];
    for (const week of planWeeks) {
      const weekOffset = (week.week_number - 1) * 7;
      for (const day of week.days || []) {
        if (day.type === 'rest') continue;
        const dayOffset = dayMap[day.day_of_week] ?? 0;
        const scheduledDate = new Date(today);
        scheduledDate.setDate(today.getDate() + weekOffset + dayOffset);
        rows.push({
          user_id: user.id,
          training_plan_id: plan.id,
          scheduled_date: format(scheduledDate, 'yyyy-MM-dd'),
          status: 'pending',
          source: 'ai_generated',
          external_title: day.title,
          external_notes: day.description || null,
          external_type: day.type,
        });
      }
    }
    if (rows.length > 0) await supabase.from('scheduled_workouts').insert(rows);

    setSaving(false);
    router.push('/training');
  };

  const inputStyle = {
    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px',
    padding: '10px 12px', color: 'var(--text-primary)', fontSize: '15px',
    fontFamily: 'DM Sans, sans-serif', outline: 'none', width: '100%',
  } as const;

  const labelStyle = {
    display: 'block', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif',
    fontWeight: 500, marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.05em',
  };

  return (
    <div style={{ padding: '20px 16px', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '26px', color: 'var(--text-primary)', margin: '0 0 6px' }}>
        Generate Program
      </h1>
      <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 24px' }}>
        AI builds a strength & conditioning program tailored to your goals.
      </p>

      {!generatedPlan && (
        <div style={{ display: 'grid', gap: '16px' }}>
          {/* Goal */}
          <div>
            <label style={labelStyle}>Training Goal</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {GOALS.map(g => (
                <button key={g.value} onClick={() => setForm(f => ({ ...f, goal: g.value }))} style={{ background: form.goal === g.value ? 'rgba(232,255,61,0.12)' : 'var(--bg-elevated)', border: `1px solid ${form.goal === g.value ? 'rgba(232,255,61,0.5)' : 'var(--border)'}`, borderRadius: '8px', padding: '10px 12px', color: form.goal === g.value ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '13px', textAlign: 'left' }}>
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* Equipment */}
          <div>
            <label style={labelStyle}>Equipment Available</label>
            <select value={form.equipment} onChange={e => setForm(f => ({ ...f, equipment: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
              {EQUIPMENT_OPTIONS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>

          {/* Weeks + Level */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Program Length</label>
              <select value={form.weeks} onChange={e => setForm(f => ({ ...f, weeks: Number(e.target.value) }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                {[4, 6, 8, 12, 16].map(w => <option key={w} value={w}>{w} weeks</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Fitness Level</label>
              <select value={form.fitness_level} onChange={e => setForm(f => ({ ...f, fitness_level: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                {['beginner', 'intermediate', 'advanced'].map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
              </select>
            </div>
          </div>

          {/* Training Days */}
          <div>
            <label style={labelStyle}>Training Days</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {DAYS.map((day, i) => (
                <button key={day} onClick={() => toggleDay(day)} style={{ background: form.training_days.includes(day) ? 'var(--accent)' : 'var(--bg-elevated)', color: form.training_days.includes(day) ? '#0A0A0A' : 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '13px' }}>
                  {DAY_LABELS[i]}
                </button>
              ))}
            </div>
          </div>

          {error && <p style={{ color: '#FF4444', fontSize: '14px', margin: 0 }}>{error}</p>}

          <button onClick={handleGenerate} disabled={loading} style={{ width: '100%', minHeight: '56px', background: 'var(--accent)', color: '#0A0A0A', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? '⚡ Generating…' : '⚡ Generate Program with AI'}
          </button>
        </div>
      )}

      {/* Plan preview */}
      {generatedPlan && (
        <div>
          <div style={{ background: 'rgba(232,255,61,0.08)', border: '1px solid rgba(232,255,61,0.2)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
            <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)', margin: '0 0 4px' }}>{generatedPlan.name}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
              {generatedPlan.total_weeks || form.weeks} weeks · {form.goal.replace('_', ' ')} · {form.fitness_level}
            </p>
          </div>

          <div style={{ marginBottom: '20px', maxHeight: '420px', overflowY: 'auto', display: 'grid', gap: '8px' }}>
            {(generatedPlan.plan_data?.weeks || []).slice(0, 4).map((week: any) => (
              <div key={week.week_number} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '12px', color: 'var(--accent)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Week {week.week_number} — {week.focus}
                </p>
                {(week.days || []).filter((d: any) => d.type !== 'rest').map((day: any, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '13px', color: 'var(--text-muted)', padding: '3px 0', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, width: '30px', color: 'var(--text-dim)', textTransform: 'uppercase', fontSize: '11px', flexShrink: 0 }}>{day.day_of_week?.slice(0, 3)}</span>
                    <span style={{ color: 'var(--text-primary)', flex: 1 }}>{day.title}</span>
                    {day.duration_min && <span style={{ color: 'var(--text-dim)', flexShrink: 0, fontSize: '12px' }}>{day.duration_min}min</span>}
                  </div>
                ))}
              </div>
            ))}
            {(generatedPlan.plan_data?.weeks || []).length > 4 && (
              <p style={{ color: 'var(--text-dim)', fontSize: '13px', textAlign: 'center', margin: 0 }}>+ {generatedPlan.plan_data.weeks.length - 4} more weeks</p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setGeneratedPlan(null)} style={{ flex: 1, minHeight: '52px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500 }}>
              Regenerate
            </button>
            <button onClick={handleSave} disabled={saving} style={{ flex: 2, minHeight: '52px', background: 'var(--accent)', color: '#0A0A0A', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Save & Add to Calendar →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
