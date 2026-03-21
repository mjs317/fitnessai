'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';

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
  collapsed?: boolean;
}

interface WorkoutBuilderProps {
  initial?: {
    id?: string;
    name?: string;
    type?: string;
    blocks?: WorkoutBlock[];
    notes?: string;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

const genId = () => Math.random().toString(36).substring(2, 10);

const defaultExercise = (): WorkoutExercise => ({
  id: genId(),
  name: '',
  sets: 3,
  reps: 10,
  weight_lbs: undefined,
});

const defaultBlock = (type: WorkoutBlock['type']): WorkoutBlock => {
  const base = { id: genId(), type, label: '', config: {}, exercises: [], collapsed: false };
  switch (type) {
    case 'strength': return { ...base, label: 'Strength', config: { rest_between_sets_sec: 90 }, exercises: [defaultExercise()] };
    case 'emom': return { ...base, label: 'EMOM', config: { duration_min: 12, interval_sec: 60 }, exercises: [defaultExercise()] };
    case 'amrap': return { ...base, label: 'AMRAP', config: { time_cap_min: 12 }, exercises: [defaultExercise()] };
    case 'fortime': return { ...base, label: 'For Time', config: { time_cap_min: 20 }, exercises: [defaultExercise()] };
    case 'tabata': return { ...base, label: 'Tabata', config: { work_sec: 20, rest_sec: 10, rounds: 8 }, exercises: [defaultExercise()] };
    case 'rest': return { ...base, label: 'Rest', config: { duration_min: 3 }, exercises: [] };
    default: return base;
  }
};

const hyroxTemplate = (): WorkoutBlock[] => {
  const stations = [
    { name: 'SkiErg', reps: '1km' },
    { name: 'Sled Push', reps: '50m', weight_lbs: 102 },
    { name: 'Sled Pull', reps: '50m', weight_lbs: 77 },
    { name: 'Burpee Broad Jumps', reps: 80 },
    { name: 'Rowing', reps: '1km' },
    { name: 'Farmers Carry', reps: '200m', weight_lbs: 53 },
    { name: 'Sandbag Lunges', reps: '100m', weight_lbs: 44 },
    { name: 'Wall Balls', reps: 100, weight_lbs: 20 },
  ];

  return stations.flatMap((station, i) => [
    {
      id: genId(),
      type: 'fortime' as const,
      label: `Run ${i + 1} — 1km`,
      config: {},
      exercises: [{ id: genId(), name: '1km Run', distance_miles: 0.621 }],
      collapsed: false,
    },
    {
      id: genId(),
      type: 'fortime' as const,
      label: `Station ${i + 1} — ${station.name}`,
      config: {},
      exercises: [{
        id: genId(),
        name: station.name,
        reps: station.reps,
        weight_lbs: station.weight_lbs,
      }],
      collapsed: false,
    },
  ]);
};

// ── Field helpers ──────────────────────────────────────────────────────────

const inputStyle = {
  background: 'var(--bg-base)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '8px 10px',
  color: 'var(--text-primary)',
  fontSize: '14px',
  fontFamily: 'DM Sans, sans-serif',
  outline: 'none',
} as const;

const labelStyle = {
  display: 'block' as const,
  fontSize: '11px',
  color: 'var(--text-muted)',
  fontFamily: 'Space Grotesk, sans-serif',
  fontWeight: 500 as const,
  marginBottom: '4px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
};

// ── ExerciseRow ────────────────────────────────────────────────────────────

function ExerciseRow({
  ex,
  blockType,
  onChange,
  onRemove,
  showSuperset,
}: {
  ex: WorkoutExercise;
  blockType: WorkoutBlock['type'];
  onChange: (updated: WorkoutExercise) => void;
  onRemove: () => void;
  showSuperset?: boolean;
}) {
  const isStrength = blockType === 'strength';

  return (
    <div style={{
      background: 'var(--bg-base)',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '8px',
      border: ex.superset ? '1px solid rgba(232,255,61,0.3)' : '1px solid var(--border)',
    }}>
      {ex.superset && (
        <div style={{ fontSize: '11px', color: 'var(--accent)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, marginBottom: '6px' }}>
          ⚡ SUPERSET
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Exercise</label>
          <input
            value={ex.name}
            onChange={e => onChange({ ...ex, name: e.target.value })}
            style={{ ...inputStyle, width: '100%' } as any}
            placeholder="e.g. Barbell Back Squat"
          />
        </div>
        <button
          onClick={onRemove}
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '8px 4px', display: 'flex', alignItems: 'center' }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px' }}>
        {isStrength && (
          <>
            <div>
              <label style={labelStyle}>Sets</label>
              <input type="number" value={ex.sets ?? ''} onChange={e => onChange({ ...ex, sets: Number(e.target.value) || undefined })} style={{ ...inputStyle, width: '100%' } as any} placeholder="3" min={1} />
            </div>
            <div>
              <label style={labelStyle}>Reps</label>
              <input value={String(ex.reps ?? '')} onChange={e => onChange({ ...ex, reps: e.target.value })} style={{ ...inputStyle, width: '100%' } as any} placeholder="10" />
            </div>
            <div>
              <label style={labelStyle}>Weight (lbs)</label>
              <input type="number" value={ex.weight_lbs ?? ''} onChange={e => onChange({ ...ex, weight_lbs: Number(e.target.value) || undefined })} style={{ ...inputStyle, width: '100%' } as any} placeholder="135" />
            </div>
          </>
        )}
        {(blockType === 'emom' || blockType === 'amrap' || blockType === 'fortime') && (
          <>
            <div>
              <label style={labelStyle}>Reps</label>
              <input value={String(ex.reps ?? '')} onChange={e => onChange({ ...ex, reps: e.target.value })} style={{ ...inputStyle, width: '100%' } as any} placeholder="21-15-9" />
            </div>
            {(blockType === 'amrap' || blockType === 'fortime') && (
              <div>
                <label style={labelStyle}>Wt (lbs)</label>
                <input type="number" value={ex.weight_lbs ?? ''} onChange={e => onChange({ ...ex, weight_lbs: Number(e.target.value) || undefined })} style={{ ...inputStyle, width: '100%' } as any} placeholder="95" />
              </div>
            )}
          </>
        )}
        {blockType === 'tabata' && (
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Exercise Name Only (intervals are set in block config)</label>
          </div>
        )}
      </div>

      {ex.notes !== undefined && (
        <div style={{ marginTop: '8px' }}>
          <input
            value={ex.notes}
            onChange={e => onChange({ ...ex, notes: e.target.value })}
            style={{ ...inputStyle, width: '100%', fontSize: '13px' } as any}
            placeholder="Notes..."
          />
        </div>
      )}

      {isStrength && showSuperset && (
        <div style={{ marginTop: '8px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={!!ex.superset} onChange={e => onChange({ ...ex, superset: e.target.checked })} />
            Superset with previous
          </label>
          <button
            onClick={() => onChange({ ...ex, notes: ex.notes !== undefined ? undefined : '' })}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '12px' }}
          >
            {ex.notes !== undefined ? '− Remove note' : '+ Add note'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── BlockEditor ────────────────────────────────────────────────────────────

function BlockEditor({
  block,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  block: WorkoutBlock;
  onChange: (updated: WorkoutBlock) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const updateConfig = (cfg: Partial<WorkoutBlock['config']>) =>
    onChange({ ...block, config: { ...block.config, ...cfg } });

  const updateExercise = (idx: number, ex: WorkoutExercise) =>
    onChange({ ...block, exercises: block.exercises.map((e, i) => i === idx ? ex : e) });

  const addExercise = () =>
    onChange({ ...block, exercises: [...block.exercises, defaultExercise()] });

  const removeExercise = (idx: number) =>
    onChange({ ...block, exercises: block.exercises.filter((_, i) => i !== idx) });

  const blockTypeColors: Record<WorkoutBlock['type'], string> = {
    strength: '#E8FF3D',
    emom: '#3B82F6',
    amrap: '#F59E0B',
    fortime: '#EF4444',
    tabata: '#8B5CF6',
    rest: '#6B7280',
  };

  const color = blockTypeColors[block.type];

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `1px solid ${color}44`,
      borderRadius: '12px',
      marginBottom: '12px',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 14px',
        background: color + '10',
        gap: '8px',
        cursor: 'pointer',
      }}
        onClick={() => onChange({ ...block, collapsed: !block.collapsed })}
      >
        <GripVertical size={16} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
        <span style={{
          background: color,
          color: '#0A0A0A',
          borderRadius: '4px',
          padding: '2px 8px',
          fontSize: '10px',
          fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: 700,
          letterSpacing: '0.06em',
          flexShrink: 0,
        }}>{block.type.toUpperCase()}</span>
        <input
          value={block.label}
          onChange={e => { e.stopPropagation(); onChange({ ...block, label: e.target.value }); }}
          onClick={e => e.stopPropagation()}
          placeholder="Block label..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            fontSize: '15px',
            fontFamily: 'Space Grotesk, sans-serif',
            fontWeight: 600,
            outline: 'none',
          } as any}
        />
        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button onClick={onMoveUp} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px' }}><ChevronUp size={14} /></button>
          <button onClick={onMoveDown} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px' }}><ChevronDown size={14} /></button>
          <button onClick={onRemove} style={{ background: 'none', border: 'none', color: '#FF4444', cursor: 'pointer', padding: '4px' }}><Trash2 size={14} /></button>
        </div>
      </div>

      {!block.collapsed && (
        <div style={{ padding: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px', marginBottom: '14px' }}>
            {block.type === 'strength' && (
              <div>
                <label style={labelStyle}>Rest (sec)</label>
                <select
                  value={block.config.rest_between_sets_sec ?? 90}
                  onChange={e => updateConfig({ rest_between_sets_sec: Number(e.target.value) })}
                  style={{ ...inputStyle, width: '100%', cursor: 'pointer' } as any}
                >
                  {[30, 60, 90, 120, 180].map(v => (
                    <option key={v} value={v}>{v === 60 ? '1 min' : v === 90 ? '90 sec' : v === 120 ? '2 min' : v === 180 ? '3 min' : `${v}s`}</option>
                  ))}
                </select>
              </div>
            )}
            {block.type === 'emom' && (
              <>
                <div>
                  <label style={labelStyle}>Duration (min)</label>
                  <input type="number" value={block.config.duration_min ?? 12} onChange={e => updateConfig({ duration_min: Number(e.target.value) })} style={{ ...inputStyle, width: '100%' } as any} min={1} />
                </div>
                <div>
                  <label style={labelStyle}>Interval (sec)</label>
                  <select value={block.config.interval_sec ?? 60} onChange={e => updateConfig({ interval_sec: Number(e.target.value) })} style={{ ...inputStyle, width: '100%', cursor: 'pointer' } as any}>
                    {[60, 90, 120].map(v => <option key={v} value={v}>{v}s</option>)}
                  </select>
                </div>
              </>
            )}
            {(block.type === 'amrap' || block.type === 'fortime') && (
              <div>
                <label style={labelStyle}>Time Cap (min)</label>
                <input type="number" value={block.config.time_cap_min ?? ''} onChange={e => updateConfig({ time_cap_min: Number(e.target.value) || undefined })} style={{ ...inputStyle, width: '100%' } as any} placeholder="None" min={1} />
              </div>
            )}
            {block.type === 'tabata' && (
              <>
                <div>
                  <label style={labelStyle}>Work (sec)</label>
                  <input type="number" value={block.config.work_sec ?? 20} onChange={e => updateConfig({ work_sec: Number(e.target.value) })} style={{ ...inputStyle, width: '100%' } as any} />
                </div>
                <div>
                  <label style={labelStyle}>Rest (sec)</label>
                  <input type="number" value={block.config.rest_sec ?? 10} onChange={e => updateConfig({ rest_sec: Number(e.target.value) })} style={{ ...inputStyle, width: '100%' } as any} />
                </div>
                <div>
                  <label style={labelStyle}>Rounds</label>
                  <input type="number" value={block.config.rounds ?? 8} onChange={e => updateConfig({ rounds: Number(e.target.value) })} style={{ ...inputStyle, width: '100%' } as any} />
                </div>
              </>
            )}
            {block.type === 'rest' && (
              <div>
                <label style={labelStyle}>Duration (min)</label>
                <input type="number" value={block.config.duration_min ?? 3} onChange={e => updateConfig({ duration_min: Number(e.target.value) })} style={{ ...inputStyle, width: '100%' } as any} />
              </div>
            )}
          </div>

          {block.type !== 'rest' && (
            <>
              {block.exercises.map((ex, idx) => (
                <ExerciseRow
                  key={ex.id}
                  ex={ex}
                  blockType={block.type}
                  onChange={updated => updateExercise(idx, updated)}
                  onRemove={() => removeExercise(idx)}
                  showSuperset={idx > 0}
                />
              ))}
              <button
                onClick={addExercise}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'none', border: '1px dashed var(--border)',
                  borderRadius: '8px', padding: '8px 14px', color: 'var(--text-muted)',
                  cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif',
                  fontWeight: 500, fontSize: '13px', width: '100%', justifyContent: 'center',
                } as any}
              >
                <Plus size={14} /> Add Exercise
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main WorkoutBuilder ────────────────────────────────────────────────────

export default function WorkoutBuilder({ initial }: WorkoutBuilderProps) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState(initial?.type ?? 'strength');
  const [blocks, setBlocks] = useState<WorkoutBlock[]>(initial?.blocks as WorkoutBlock[] ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [showBlockMenu, setShowBlockMenu] = useState(false);

  const estimatedDuration = blocks.reduce((sum, b) => {
    if (b.type === 'emom') return sum + (b.config.duration_min || 0);
    if (b.type === 'amrap' || b.type === 'fortime') return sum + (b.config.time_cap_min || 0);
    if (b.type === 'tabata') {
      const rounds = b.config.rounds || 8;
      const work = b.config.work_sec || 20;
      const rest = b.config.rest_sec || 10;
      return sum + Math.ceil((rounds * (work + rest)) / 60);
    }
    if (b.type === 'rest') return sum + (b.config.duration_min || 0);
    if (b.type === 'strength') {
      const totalSets = b.exercises.reduce((s, e) => s + (e.sets || 3), 0);
      return sum + Math.ceil(totalSets * ((b.config.rest_between_sets_sec || 90) + 45) / 60);
    }
    return sum;
  }, 0);

  const addBlock = (type: WorkoutBlock['type']) => {
    setBlocks(prev => [...prev, defaultBlock(type)]);
    setShowBlockMenu(false);
  };

  const updateBlock = (idx: number, block: WorkoutBlock) =>
    setBlocks(prev => prev.map((b, i) => i === idx ? block : b));

  const removeBlock = (idx: number) =>
    setBlocks(prev => prev.filter((_, i) => i !== idx));

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setBlocks(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const moveDown = (idx: number) => {
    setBlocks(prev => {
      if (idx === prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  const useHyrox = () => {
    setType('hyrox');
    setName(name || 'Hyrox Race Simulation');
    setBlocks(hyroxTemplate());
  };

  const handleSave = async () => {
    if (!name.trim()) { alert('Give this workout a name'); return; }
    setSaving(true);

    const payload = {
      id: initial?.id,
      name: name.trim(),
      type,
      estimated_duration_min: estimatedDuration || null,
      blocks,
      notes: notes.trim() || null,
    };

    const method = initial?.id ? 'PUT' : 'POST';
    const res = await fetch('/api/workouts', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const { data, error } = await res.json();

    setSaving(false);
    if (error) { alert('Save failed: ' + error); return; }
    router.push(`/workouts/${data.id}`);
  };

  const blockTypes: Array<{ type: WorkoutBlock['type']; label: string; desc: string; color: string }> = [
    { type: 'strength', label: 'Strength', desc: 'Sets × reps × weight', color: '#E8FF3D' },
    { type: 'emom', label: 'EMOM', desc: 'Every minute on the minute', color: '#3B82F6' },
    { type: 'amrap', label: 'AMRAP', desc: 'As many rounds as possible', color: '#F59E0B' },
    { type: 'fortime', label: 'For Time', desc: 'Complete as fast as possible', color: '#EF4444' },
    { type: 'tabata', label: 'Tabata', desc: 'Work/rest intervals', color: '#8B5CF6' },
    { type: 'rest', label: 'Rest', desc: 'Recovery block', color: '#6B7280' },
  ];

  return (
    <div style={{ padding: '20px 16px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Workout name..."
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderBottom: '2px solid var(--border)',
            color: 'var(--text-primary)',
            fontSize: '26px',
            fontFamily: 'Space Grotesk, sans-serif',
            fontWeight: 700,
            outline: 'none',
            padding: '4px 0 8px',
            marginBottom: '12px',
          } as any}
        />
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={type}
            onChange={e => setType(e.target.value)}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '8px 12px',
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontFamily: 'Space Grotesk, sans-serif',
              fontWeight: 500,
              cursor: 'pointer',
              outline: 'none',
            } as any}
          >
            {['strength', 'crossfit', 'hyrox', 'run', 'bike', 'mixed'].map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
          <span style={{ fontSize: '13px', color: 'var(--text-dim)', fontFamily: 'Space Grotesk, sans-serif' }}>
            ~{estimatedDuration || '?'} min
          </span>
          {(type === 'hyrox' || type === 'crossfit') && (
            <button
              onClick={useHyrox}
              style={{
                background: 'rgba(232,255,61,0.1)',
                border: '1px solid var(--accent)',
                borderRadius: '8px',
                padding: '8px 12px',
                color: 'var(--accent)',
                cursor: 'pointer',
                fontSize: '12px',
                fontFamily: 'Space Grotesk, sans-serif',
                fontWeight: 600,
              } as any}
            >⚡ Use Hyrox Template</button>
          )}
        </div>
      </div>

      {blocks.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: 'var(--text-dim)',
          border: '1px dashed var(--border)',
          borderRadius: '12px',
          marginBottom: '16px',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
          <p style={{ margin: 0, fontSize: '14px' }}>No blocks yet. Add your first block below.</p>
        </div>
      )}

      {blocks.map((block, idx) => (
        <BlockEditor
          key={block.id}
          block={block}
          onChange={updated => updateBlock(idx, updated)}
          onRemove={() => removeBlock(idx)}
          onMoveUp={() => moveUp(idx)}
          onMoveDown={() => moveDown(idx)}
        />
      ))}

      <div style={{ position: 'relative', marginBottom: '20px' }}>
        <button
          onClick={() => setShowBlockMenu(!showBlockMenu)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center',
            width: '100%', background: 'var(--bg-elevated)', border: '1px dashed var(--border)',
            borderRadius: '10px', padding: '14px', color: 'var(--accent)', cursor: 'pointer',
            fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '14px',
          } as any}
        >
          <Plus size={16} /> Add Block
        </button>

        {showBlockMenu && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 50,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '8px',
            marginTop: '4px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            {blockTypes.map(({ type: t, label, desc, color }) => (
              <button
                key={t}
                onClick={() => addBlock(t)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  width: '100%', background: 'transparent', border: 'none',
                  borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
                } as any}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ background: color, borderRadius: '4px', padding: '2px 8px', fontSize: '10px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, color: '#0A0A0A', flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'DM Sans, sans-serif' }}>{desc}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ ...labelStyle, display: 'block' }}>Workout Notes (optional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any special instructions, warm-up notes, etc."
          rows={3}
          style={{ ...inputStyle, width: '100%', resize: 'vertical' } as any}
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%', background: 'var(--accent)', color: '#0A0A0A',
          border: 'none', borderRadius: '10px', padding: '16px',
          fontSize: '16px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif',
          cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
        } as any}
      >
        {saving ? 'Saving...' : initial?.id ? 'Save Changes' : 'Save Workout'}
      </button>
    </div>
  );
}
