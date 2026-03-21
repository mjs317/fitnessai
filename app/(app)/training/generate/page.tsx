'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { format, parseISO } from 'date-fns';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function GeneratePlanPage() {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({
    sport: 'running',
    race_distance: 'Half Marathon',
    race_date: '',
    current_weekly_miles: '',
    training_days: ['monday', 'tuesday', 'thursday', 'saturday', 'sunday'],
    fitness_level: 'intermediate',
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
    if (!form.race_date) { setError('Please set a race date'); return; }
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
      if (data.error) { setError(data.error); }
      else { setGeneratedPlan(data.plan); }
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

    // Save plan
    const { data: plan, error: planErr } = await supabase.from('training_plans').insert({
      user_id: user.id,
      name: generatedPlan.name,
      sport: generatedPlan.sport,
      race_distance: generatedPlan.race_distance,
      race_date: generatedPlan.race_date,
      total_weeks: generatedPlan.total_weeks,
      plan_data: generatedPlan.plan_data,
      source: 'ai_generated',
      is_active: true,
    }).select().single();

    if (planErr || !plan) { setError('Save failed'); setSaving(false); return; }

    // Deactivate other plans
    await supabase.from('training_plans').update({ is_active: false }).eq('user_id', user.id).neq('id', plan.id);

    // Populate first 2 weeks into calendar
    const weeks = generatedPlan.plan_data?.weeks?.slice(0, 2) || [];
    const dayMap: Record<string, number> = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };

    const today = new Date();
    for (const week of weeks) {
      const weekOffset = (week.week_number - 1) * 7;
      for (const day of week.days || []) {
        if (day.type === 'rest') continue;
        const dayOffset = dayMap[day.day_of_week] || 0;
        const scheduledDate = new Date(today);
        scheduledDate.setDate(today.getDate() + weekOffset + dayOffset);

        await supabase.from('scheduled_workouts').insert({
          user_id: user.id,
          plan_id: plan.id,
          scheduled_date: format(scheduledDate, 'yyyy-MM-dd'),
          status: 'pending',
          source: 'plan',
          external_title: day.title,
          external_description: day.description,
          external_type: day.type,
        });
      }
    }

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
    fontWeight: 500, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em',
  } as const;

  return (
    <div style={{ padding: '20px 16px', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '26px', color: 'var(--text-primary)', margin: '0 0 24px' }}>
        Generate Training Plan
      </h1>

      {!generatedPlan && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Sport</label>
              <select value={form.sport} onChange={e => setForm(f => ({ ...f, sport: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                {['running', 'cycling', 'triathlon', 'hyrox'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Race Distance</label>
              <select value={form.race_distance} onChange={e => setForm(f => ({ ...f, race_distance: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                {['5K', '10K', 'Half Marathon', 'Full Marathon', 'Hyrox', 'Olympic Tri', 'Half Ironman', 'Ironman', 'Other'].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Race Date *</label>
            <input type="date" value={form.race_date} onChange={e => setForm(f => ({ ...f, race_date: e.target.value }))} style={inputStyle} min={format(new Date(), 'yyyy-MM-dd')} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Current Weekly Miles</label>
              <input type="number" value={form.current_weekly_miles} onChange={e => setForm(f => ({ ...f, current_weekly_miles: e.target.value }))} style={inputStyle} placeholder="20" />
            </div>
            <div>
              <label style={labelStyle}>Fitness Level</label>
              <select value={form.fitness_level} onChange={e => setForm(f => ({ ...f, fitness_level: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                {['beginner', 'intermediate', 'advanced'].map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Training Days</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {DAYS.map((day, i) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  style={{
                    background: form.training_days.includes(day) ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: form.training_days.includes(day) ? '#0A0A0A' : 'var(--text-muted)',
                    border: '1px solid var(--border)', borderRadius: '8px',
                    padding: '8px 12px', cursor: 'pointer',
                    fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '13px',
                  }}
                >{DAY_LABELS[i]}</button>
              ))}
            </div>
          </div>

          {error && <p style={{ color: '#FF4444', fontSize: '14px', margin: 0 }}>{error}</p>}

          <button
            onClick={handleGenerate}
            disabled={loading}
            style={{ width: '100%', minHeight: '56px', background: 'var(--accent)', color: '#0A0A0A', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? '⚡ Generating Plan...' : '⚡ Generate Plan with AI'}
          </button>
        </div>
      )}

      {/* Plan preview */}
      {generatedPlan && (
        <div>
          <div style={{ background: 'rgba(232,255,61,0.08)', border: '1px solid rgba(232,255,61,0.2)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
            <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)', margin: '0 0 4px' }}>{generatedPlan.name}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 12px' }}>
              {generatedPlan.total_weeks} weeks · {generatedPlan.race_distance} · Race: {generatedPlan.race_date}
            </p>
          </div>

          {/* Week preview table */}
          <div style={{ marginBottom: '20px', maxHeight: '400px', overflowY: 'auto' }}>
            {(generatedPlan.plan_data?.weeks || []).slice(0, 4).map((week: any) => (
              <div key={week.week_number} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', marginBottom: '8px' }}>
                <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '13px', color: 'var(--accent)', margin: '0 0 6px' }}>
                  Week {week.week_number} — {week.focus} · {week.total_distance_miles?.toFixed(0) || '?'} miles
                </p>
                {(week.days || []).filter((d: any) => d.type !== 'rest').map((day: any, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '13px', color: 'var(--text-muted)', padding: '3px 0' }}>
                    <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, minWidth: '32px', color: 'var(--text-dim)', textTransform: 'uppercase', fontSize: '11px' }}>{day.day_of_week?.slice(0, 3)}</span>
                    <span style={{ color: 'var(--text-primary)' }}>{day.title}</span>
                    {day.duration_min && <span style={{ color: 'var(--text-dim)', marginLeft: 'auto', flexShrink: 0 }}>{day.duration_min}min</span>}
                  </div>
                ))}
              </div>
            ))}
            {(generatedPlan.plan_data?.weeks || []).length > 4 && (
              <p style={{ color: 'var(--text-dim)', fontSize: '13px', textAlign: 'center' }}>... {generatedPlan.plan_data.weeks.length - 4} more weeks</p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setGeneratedPlan(null)} style={{ flex: 1, minHeight: '52px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500 }}>
              Regenerate
            </button>
            <button onClick={handleSave} disabled={saving} style={{ flex: 2, minHeight: '52px', background: 'var(--accent)', color: '#0A0A0A', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save & Populate Calendar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
