'use client';

import { useState } from 'react';
import { format, subDays, parseISO } from 'date-fns';
import { Plus, X, Pencil, Check } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MealTemplate {
  id: string;
  name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  category: string;
  is_meal_prep: boolean;
  sort_order: number;
}

interface MealLog {
  id: string;
  meal_name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  logged_at: string;
}

interface DailyMetric {
  date: string;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  calories: number;
  weight_lbs: number | null;
}

interface Goals {
  daily_calories: number;
  daily_protein_g: number;
  daily_carbs_g: number;
  daily_fat_g: number;
  weight_goal_lbs: number | null;
  body_fat_goal_pct: number | null;
}

interface NutritionClientProps {
  todayLogs: MealLog[];
  templates: MealTemplate[];
  weeklyData: DailyMetric[];
  goals: Goals;
}

// ─── Shared styles ───────────────────────────────────────────────────────────

const card = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '16px',
  marginBottom: '12px',
} as const;

const sectionLabel = {
  fontFamily: 'Space Grotesk, sans-serif',
  fontWeight: 600,
  fontSize: '11px',
  color: 'var(--text-dim)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  marginBottom: '8px',
  margin: '0 0 8px',
};

const inputStyle = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '10px 12px',
  color: 'var(--text-primary)',
  fontSize: '14px',
  fontFamily: 'DM Sans, sans-serif',
  outline: 'none',
  width: '100%',
} as const;

// ─── Macro progress bar ───────────────────────────────────────────────────────

function MacroBar({ label, current, goal, color, unit = 'g' }: {
  label: string; current: number; goal: number; color: string; unit?: string;
}) {
  const pct = Math.min((current / Math.max(goal, 1)) * 100, 100);
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '13px', color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
          {Math.round(current)}<span style={{ color: 'var(--text-dim)' }}>/{goal}{unit}</span>
        </span>
      </div>
      <div style={{ height: '8px', background: 'var(--bg-elevated)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '4px', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

// ─── Macro pill ────────────────────────────────────────────────────────────

function MacroPill({ label, value, color }: { label: string; value: number | null; color: string }) {
  if (value == null) return null;
  return (
    <span style={{
      background: color + '22',
      color: color,
      borderRadius: '4px',
      padding: '2px 7px',
      fontSize: '11px',
      fontFamily: 'Space Grotesk, sans-serif',
      fontWeight: 600,
      marginRight: '4px',
    }}>{label}{Math.round(value)}</span>
  );
}

// ─── Tab 1: Today's Log ────────────────────────────────────────────────────

function TodayLog({ logs: initialLogs, templates, goals }: {
  logs: MealLog[];
  templates: MealTemplate[];
  goals: Goals;
}) {
  const [logs, setLogs] = useState(initialLogs);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const totals = logs.reduce(
    (acc, log) => ({
      calories: acc.calories + (log.calories || 0),
      protein_g: acc.protein_g + (log.protein_g || 0),
      carbs_g: acc.carbs_g + (log.carbs_g || 0),
      fat_g: acc.fat_g + (log.fat_g || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  const handleLogTemplate = async (template: MealTemplate) => {
    setSaving(template.id);
    // Optimistic
    const optimistic: MealLog = {
      id: 'temp-' + Date.now(),
      meal_name: template.name,
      calories: template.calories,
      protein_g: template.protein_g,
      carbs_g: template.carbs_g,
      fat_g: template.fat_g,
      logged_at: new Date().toISOString(),
    };
    setLogs(prev => [optimistic, ...prev]);
    setShowAdd(false);

    const res = await fetch('/api/nutrition/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meal_template_id: template.id,
        meal_name: template.name,
        calories: template.calories,
        protein_g: template.protein_g,
        carbs_g: template.carbs_g,
        fat_g: template.fat_g,
      }),
    });
    const { data } = await res.json();
    if (data) {
      setLogs(prev => prev.map(l => l.id === optimistic.id ? data : l));
    }
    setSaving(null);
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    setLogs(prev => prev.filter(l => l.id !== id));
    await fetch(`/api/nutrition/log?id=${id}`, { method: 'DELETE' });
    setDeleting(null);
  };

  const categoryOrder = ['breakfast', 'pre-workout', 'lunch', 'post-workout', 'dinner', 'snack'];
  const grouped = categoryOrder.reduce<Record<string, MealTemplate[]>>((acc, cat) => {
    const items = templates.filter(t => t.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});
  const categoryLabel: Record<string, string> = {
    breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner',
    'pre-workout': 'Pre-Workout', 'post-workout': 'Post-Workout', snack: 'Snack',
  };

  return (
    <div>
      {/* Macro totals */}
      <div style={card}>
        <p style={sectionLabel}>Daily Totals</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: '12px' }}>
          {[
            { label: 'Calories', value: Math.round(totals.calories), goal: goals.daily_calories, unit: 'kcal', color: 'var(--accent)' },
            { label: 'Protein', value: Math.round(totals.protein_g), goal: goals.daily_protein_g, unit: 'g', color: '#22C55E' },
            { label: 'Carbs', value: Math.round(totals.carbs_g), goal: goals.daily_carbs_g, unit: 'g', color: '#3B82F6' },
            { label: 'Fat', value: Math.round(totals.fat_g), goal: goals.daily_fat_g, unit: 'g', color: '#F59E0B' },
          ].map(({ label, value, goal, unit, color }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '22px', color }}>
                {value}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif' }}>
                {label} · {goal}{unit}
              </div>
              <div style={{ height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min((value/goal)*100, 100)}%`, background: color, borderRadius: '2px', transition: 'width 0.4s' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Meal log timeline */}
      {logs.length > 0 && (
        <div style={card}>
          <p style={sectionLabel}>Today's meals</p>
          {logs.map(log => (
            <div key={log.id} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 0',
              borderBottom: '1px solid var(--border)',
            }}>
              <div>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '14px', color: 'var(--text-primary)' }}>
                  {log.meal_name}
                </div>
                <div style={{ marginTop: '4px' }}>
                  <MacroPill label="P" value={log.protein_g} color="#22C55E" />
                  <MacroPill label="C" value={log.carbs_g} color="#3B82F6" />
                  <MacroPill label="F" value={log.fat_g} color="#F59E0B" />
                  {log.calories && <MacroPill label="" value={log.calories} color="var(--accent)" />}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                  {format(parseISO(log.logged_at), 'h:mm a')}
                </span>
                <button
                  onClick={() => handleDelete(log.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add meal button */}
      <button
        onClick={() => setShowAdd(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--bg-elevated)',
          border: '1px dashed var(--border)',
          borderRadius: '10px',
          padding: '14px 16px',
          color: 'var(--accent)',
          cursor: 'pointer',
          width: '100%',
          fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: 600,
          fontSize: '14px',
          marginTop: '4px',
        }}
      >
        <Plus size={16} />
        Log Meal
      </button>

      {/* Meal picker sheet */}
      {showAdd && (
        <div
          onClick={() => setShowAdd(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-elevated)', borderRadius: '16px 16px 0 0', padding: '20px', width: '100%', maxHeight: '80vh', overflowY: 'auto', border: '1px solid var(--border)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)', margin: 0 }}>
                Log Meal
              </h3>
              <button onClick={() => setShowAdd(false)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px' }}>
                ×
              </button>
            </div>
            {templates.length === 0 && (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', fontSize: '14px' }}>
                No meal templates. Add some in the Meal Library tab.
              </p>
            )}
            {categoryOrder.map(cat => {
              const items = grouped[cat];
              if (!items) return null;
              return (
                <div key={cat} style={{ marginBottom: '16px' }}>
                  <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '11px', color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 8px' }}>
                    {categoryLabel[cat]}
                  </p>
                  {items.map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleLogTemplate(t)}
                      disabled={!!saving}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)',
                        borderRadius: '10px', padding: '12px 14px', marginBottom: '6px',
                        cursor: saving ? 'not-allowed' : 'pointer', textAlign: 'left',
                        opacity: saving === t.id ? 0.5 : 1,
                      }}
                    >
                      <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '14px', color: 'var(--text-primary)' }}>
                        {saving === t.id ? 'Logging...' : t.name}
                        {t.is_meal_prep && <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--accent)' }}>⭐</span>}
                      </span>
                      <div>
                        <MacroPill label="P" value={t.protein_g} color="#22C55E" />
                        <MacroPill label="" value={t.calories} color="var(--accent)" />
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Meal Library ───────────────────────────────────────────────────

function MealLibrary({ templates: initialTemplates }: { templates: MealTemplate[] }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [filter, setFilter] = useState<string>('all');
  const [mealPrepOnly, setMealPrepOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MealTemplate | null>(null);
  const [form, setForm] = useState({
    name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '',
    category: 'snack', is_meal_prep: false,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const categories = ['all', 'breakfast', 'lunch', 'dinner', 'pre-workout', 'post-workout', 'snack'];
  const categoryLabel: Record<string, string> = {
    all: 'All', breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner',
    'pre-workout': 'Pre-WO', 'post-workout': 'Post-WO', snack: 'Snack',
  };

  const filtered = templates.filter(t => {
    if (mealPrepOnly && !t.is_meal_prep) return false;
    if (filter !== 'all' && t.category !== filter) return false;
    return true;
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', category: 'snack', is_meal_prep: false });
    setShowForm(true);
  };

  const openEdit = (t: MealTemplate) => {
    setEditing(t);
    setForm({
      name: t.name,
      calories: t.calories?.toString() ?? '',
      protein_g: t.protein_g?.toString() ?? '',
      carbs_g: t.carbs_g?.toString() ?? '',
      fat_g: t.fat_g?.toString() ?? '',
      category: t.category,
      is_meal_prep: t.is_meal_prep,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      name: form.name,
      calories: form.calories ? Number(form.calories) : null,
      protein_g: form.protein_g ? Number(form.protein_g) : null,
      carbs_g: form.carbs_g ? Number(form.carbs_g) : null,
      fat_g: form.fat_g ? Number(form.fat_g) : null,
      category: form.category,
      is_meal_prep: form.is_meal_prep,
    };

    if (editing) {
      const res = await fetch('/api/nutrition/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, ...payload }),
      });
      const { data } = await res.json();
      if (data) setTemplates(prev => prev.map(t => t.id === editing.id ? data : t));
    } else {
      const res = await fetch('/api/nutrition/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const { data } = await res.json();
      if (data) setTemplates(prev => [data, ...prev]);
    }

    setSaving(false);
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this meal template?')) return;
    setDeleting(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
    await fetch(`/api/nutrition/templates?id=${id}`, { method: 'DELETE' });
    setDeleting(null);
  };

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '12px' }}>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            style={{
              flexShrink: 0,
              background: filter === cat ? 'var(--accent)' : 'var(--bg-elevated)',
              color: filter === cat ? '#0A0A0A' : 'var(--text-muted)',
              border: 'none',
              borderRadius: '20px',
              padding: '6px 14px',
              fontSize: '12px',
              fontFamily: 'Space Grotesk, sans-serif',
              fontWeight: filter === cat ? 700 : 500,
              cursor: 'pointer',
            }}
          >{categoryLabel[cat]}</button>
        ))}
        <button
          onClick={() => setMealPrepOnly(!mealPrepOnly)}
          style={{
            flexShrink: 0,
            background: mealPrepOnly ? 'rgba(232,255,61,0.15)' : 'var(--bg-elevated)',
            color: mealPrepOnly ? 'var(--accent)' : 'var(--text-muted)',
            border: mealPrepOnly ? '1px solid var(--accent)' : '1px solid var(--border)',
            borderRadius: '20px',
            padding: '6px 14px',
            fontSize: '12px',
            fontFamily: 'Space Grotesk, sans-serif',
            fontWeight: mealPrepOnly ? 700 : 500,
            cursor: 'pointer',
          }}
        >⭐ Meal Prep</button>
      </div>

      {/* Template grid */}
      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '14px' }}>
          No meals here yet. Add one below!
        </div>
      )}
      <div style={{ display: 'grid', gap: '8px' }}>
        {filtered.map(t => (
          <div
            key={t.id}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                {t.name}
                {t.is_meal_prep && <span style={{ marginLeft: '6px', fontSize: '12px' }}>⭐</span>}
              </div>
              <div>
                <MacroPill label="P" value={t.protein_g} color="#22C55E" />
                <MacroPill label="C" value={t.carbs_g} color="#3B82F6" />
                <MacroPill label="F" value={t.fat_g} color="#F59E0B" />
                {t.calories && <MacroPill label="" value={t.calories} color="var(--accent)" />}
              </div>
            </div>
            <button
              onClick={() => openEdit(t)}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                marginLeft: '8px',
              }}
            >
              <Pencil size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Add button */}
      <button
        onClick={openNew}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'var(--bg-elevated)', border: '1px dashed var(--border)',
          borderRadius: '10px', padding: '14px 16px', color: 'var(--accent)',
          cursor: 'pointer', width: '100%',
          fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '14px', marginTop: '12px',
        }}
      >
        <Plus size={16} />
        New Meal Template
      </button>

      {/* Edit/Create form sheet */}
      {showForm && (
        <div
          onClick={() => setShowForm(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-elevated)', borderRadius: '16px 16px 0 0', padding: '24px', width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)', margin: 0 }}>
                {editing ? 'Edit Meal' : 'New Meal Template'}
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {editing && (
                  <button
                    onClick={() => { handleDelete(editing.id); setShowForm(false); }}
                    style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid #FF444433', color: '#FF4444', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', fontSize: '13px', fontFamily: 'Space Grotesk, sans-serif' }}
                  >Delete</button>
                )}
                <button onClick={() => setShowForm(false)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px' }}>
                  ×
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="e.g. Ground chicken + rice" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  { key: 'calories', label: 'Calories', placeholder: '540' },
                  { key: 'protein_g', label: 'Protein (g)', placeholder: '45' },
                  { key: 'carbs_g', label: 'Carbs (g)', placeholder: '60' },
                  { key: 'fat_g', label: 'Fat (g)', placeholder: '12' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
                    <input
                      type="number"
                      value={(form as any)[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      style={inputStyle}
                      placeholder={placeholder}
                    />
                  </div>
                ))}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {['breakfast', 'lunch', 'dinner', 'pre-workout', 'post-workout', 'snack'].map(c => (
                    <option key={c} value={c}>{c.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                  ))}
                </select>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <div
                  onClick={() => setForm(f => ({ ...f, is_meal_prep: !f.is_meal_prep }))}
                  style={{
                    width: '44px', height: '24px',
                    background: form.is_meal_prep ? 'var(--accent)' : 'var(--bg-elevated)',
                    borderRadius: '12px',
                    position: 'relative',
                    transition: 'background 0.2s',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    top: '2px',
                    left: form.is_meal_prep ? '22px' : '2px',
                    width: '18px', height: '18px',
                    background: form.is_meal_prep ? '#0A0A0A' : 'var(--text-dim)',
                    borderRadius: '50%',
                    transition: 'left 0.2s',
                  }} />
                </div>
                <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '14px', color: 'var(--text-primary)' }}>
                  Meal Prep ⭐ <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(weekly rotation)</span>
                </span>
              </label>
            </div>

            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              style={{
                width: '100%', background: 'var(--accent)', color: '#0A0A0A',
                border: 'none', borderRadius: '10px', padding: '16px',
                fontSize: '16px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif',
                cursor: saving || !form.name.trim() ? 'not-allowed' : 'pointer',
                opacity: saving || !form.name.trim() ? 0.6 : 1,
                marginTop: '20px',
              }}
            >
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Meal Template'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 3: Goals & Trends ─────────────────────────────────────────────────

function GoalsTrends({ goals: initialGoals, weeklyData }: { goals: Goals; weeklyData: DailyMetric[] }) {
  const [goals, setGoals] = useState(initialGoals);
  const [form, setForm] = useState({
    daily_calories: String(initialGoals.daily_calories),
    daily_protein_g: String(initialGoals.daily_protein_g),
    daily_carbs_g: String(initialGoals.daily_carbs_g),
    daily_fat_g: String(initialGoals.daily_fat_g),
    weight_goal_lbs: String(initialGoals.weight_goal_lbs ?? ''),
    body_fat_goal_pct: String(initialGoals.body_fat_goal_pct ?? ''),
  });
  const [tdee, setTdee] = useState({ weight: '', height: '', age: '', activity: '1.55' });
  const [tdeeResult, setTdeeResult] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const calcTDEE = () => {
    const w = Number(tdee.weight) * 0.453592; // lbs to kg
    const h = Number(tdee.height) * 2.54;     // inches to cm
    const a = Number(tdee.age);
    const bmr = 10 * w + 6.25 * h - 5 * a + 5; // Mifflin-St Jeor (male)
    setTdeeResult(Math.round(bmr * Number(tdee.activity)));
  };

  const handleSave = async () => {
    setSaving(true);
    await fetch('/api/nutrition/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        daily_calories: Number(form.daily_calories),
        daily_protein_g: Number(form.daily_protein_g),
        daily_carbs_g: Number(form.daily_carbs_g),
        daily_fat_g: Number(form.daily_fat_g),
        weight_goal_lbs: form.weight_goal_lbs ? Number(form.weight_goal_lbs) : null,
        body_fat_goal_pct: form.body_fat_goal_pct ? Number(form.body_fat_goal_pct) : null,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Chart data — last 7 days
  const chartData = weeklyData.slice(-7).map(d => ({
    date: format(parseISO(d.date), 'EEE'),
    protein: Math.round(d.protein_g),
    carbs: Math.round(d.carbs_g),
    fat: Math.round(d.fat_g),
    calories: Math.round(d.calories),
  }));

  const weightData = weeklyData.filter(d => d.weight_lbs).slice(-14).map(d => ({
    date: format(parseISO(d.date), 'M/d'),
    weight: d.weight_lbs,
  }));

  const customTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px' }}>
        <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{label}</p>
        {payload.map((p: any) => (
          <p key={p.name} style={{ color: p.color, margin: '2px 0' }}>{p.name}: {p.value}</p>
        ))}
      </div>
    );
  };

  return (
    <div>
      {/* Goals form */}
      <div style={card}>
        <p style={sectionLabel}>Daily Nutrition Targets</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
          {[
            { key: 'daily_calories', label: 'Calories' },
            { key: 'daily_protein_g', label: 'Protein (g)' },
            { key: 'daily_carbs_g', label: 'Carbs (g)' },
            { key: 'daily_fat_g', label: 'Fat (g)' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
              <input
                type="number"
                value={(form as any)[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                style={{ ...inputStyle, fontSize: '16px' }}
              />
            </div>
          ))}
        </div>

        <p style={{ ...sectionLabel, marginTop: '8px' }}>Body Goals</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Goal Weight (lbs)</label>
            <input type="number" value={form.weight_goal_lbs} onChange={e => setForm(f => ({ ...f, weight_goal_lbs: e.target.value }))} style={{ ...inputStyle, fontSize: '16px' }} placeholder="185" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Goal Body Fat %</label>
            <input type="number" value={form.body_fat_goal_pct} onChange={e => setForm(f => ({ ...f, body_fat_goal_pct: e.target.value }))} style={{ ...inputStyle, fontSize: '16px' }} placeholder="15" />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', background: saved ? '#22C55E' : 'var(--accent)', color: '#0A0A0A',
            border: 'none', borderRadius: '10px', padding: '14px',
            fontSize: '15px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif',
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            transition: 'background 0.3s',
          }}
        >
          {saved ? <><Check size={16} /> Saved!</> : saving ? 'Saving...' : 'Save Targets'}
        </button>
      </div>

      {/* TDEE estimator */}
      <div style={card}>
        <p style={sectionLabel}>TDEE Estimator</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Weight (lbs)</label>
            <input type="number" value={tdee.weight} onChange={e => setTdee(t => ({ ...t, weight: e.target.value }))} style={inputStyle} placeholder="185" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Height (inches)</label>
            <input type="number" value={tdee.height} onChange={e => setTdee(t => ({ ...t, height: e.target.value }))} style={inputStyle} placeholder="70" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Age</label>
            <input type="number" value={tdee.age} onChange={e => setTdee(t => ({ ...t, age: e.target.value }))} style={inputStyle} placeholder="32" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Activity Level</label>
            <select value={tdee.activity} onChange={e => setTdee(t => ({ ...t, activity: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="1.2">Sedentary</option>
              <option value="1.375">Light (1-3 days/wk)</option>
              <option value="1.55">Moderate (3-5 days/wk)</option>
              <option value="1.725">Active (6-7 days/wk)</option>
              <option value="1.9">Very Active (2x/day)</option>
            </select>
          </div>
        </div>
        <button
          onClick={calcTDEE}
          style={{
            width: '100%', background: 'var(--bg-elevated)', color: 'var(--text-primary)',
            border: '1px solid var(--border)', borderRadius: '8px', padding: '12px',
            fontSize: '14px', fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif', cursor: 'pointer',
            marginBottom: tdeeResult ? '12px' : '0',
          }}
        >Calculate TDEE</button>
        {tdeeResult && (
          <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(232,255,61,0.08)', borderRadius: '8px', border: '1px solid rgba(232,255,61,0.2)' }}>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '28px', color: 'var(--accent)' }}>{tdeeResult} kcal/day</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Estimated daily energy expenditure</div>
          </div>
        )}
      </div>

      {/* 7-day macro adherence chart */}
      {chartData.length > 0 && (
        <div style={card}>
          <p style={sectionLabel}>7-Day Macro Adherence</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
              <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 11, fontFamily: 'Space Grotesk, sans-serif' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#888', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={customTooltip} />
              <Bar dataKey="protein" name="Protein" stackId="a" fill="#22C55E" radius={[0,0,0,0]} />
              <Bar dataKey="carbs" name="Carbs" stackId="a" fill="#3B82F6" radius={[0,0,0,0]} />
              <Bar dataKey="fat" name="Fat" stackId="a" fill="#F59E0B" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 14-day weight trend */}
      {weightData.length > 1 && (
        <div style={card}>
          <p style={sectionLabel}>14-Day Weight Trend</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={weightData} margin={{ top: 4, right: 4, bottom: 4, left: -10 }}>
              <CartesianGrid stroke="#2A2A2A" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 10, fontFamily: 'Space Grotesk, sans-serif' }} axisLine={false} tickLine={false} />
              <YAxis domain={['auto', 'auto']} tick={{ fill: '#888', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={customTooltip} />
              <Line type="monotone" dataKey="weight" name="Weight (lbs)" stroke="var(--accent)" strokeWidth={2} dot={{ fill: 'var(--accent)', r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Main NutritionClient ──────────────────────────────────────────────────

export default function NutritionClient({ todayLogs, templates, weeklyData, goals }: NutritionClientProps) {
  const [tab, setTab] = useState<'today' | 'library' | 'goals'>('today');

  const tabs: Array<{ key: typeof tab; label: string }> = [
    { key: 'today', label: "Today's Log" },
    { key: 'library', label: 'Meal Library' },
    { key: 'goals', label: 'Goals & Trends' },
  ];

  return (
    <div style={{ padding: '20px 16px', maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '26px', color: 'var(--text-primary)', margin: '0 0 20px' }}>
        Nutrition
      </h1>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '4px',
        marginBottom: '20px',
        gap: '4px',
      }}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              flex: 1,
              background: tab === key ? 'var(--bg-elevated)' : 'transparent',
              border: tab === key ? '1px solid var(--border)' : '1px solid transparent',
              borderRadius: '8px',
              padding: '10px 8px',
              color: tab === key ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontFamily: 'Space Grotesk, sans-serif',
              fontWeight: tab === key ? 600 : 400,
              fontSize: '13px',
              transition: 'all 0.15s',
            }}
          >{label}</button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'today' && <TodayLog logs={todayLogs} templates={templates} goals={goals} />}
      {tab === 'library' && <MealLibrary templates={templates} />}
      {tab === 'goals' && <GoalsTrends goals={goals} weeklyData={weeklyData} />}
    </div>
  );
}
