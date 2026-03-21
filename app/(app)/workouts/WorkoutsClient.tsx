'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Plus, Camera, Clock, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

interface Workout {
  id: string;
  name: string;
  type: string;
  estimated_duration_min: number | null;
  source: string;
  created_at: string;
}

interface WorkoutsClientProps {
  initialWorkouts: Workout[];
}

const typeEmoji: Record<string, string> = {
  strength: '💪', crossfit: '🏋️', hyrox: '⚡', run: '🏃', bike: '🚴', mixed: '🔥',
};

const typeColors: Record<string, string> = {
  strength: '#E8FF3D', crossfit: '#F59E0B', hyrox: '#EF4444', run: '#22C55E', bike: '#3B82F6', mixed: '#8B5CF6',
};

export default function WorkoutsClient({ initialWorkouts }: WorkoutsClientProps) {
  const [workouts, setWorkouts] = useState(initialWorkouts);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState('');
  const [parsedWorkout, setParsedWorkout] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setParseError('');

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch('/api/workouts/parse-screenshot', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) {
        setParseError(data.error);
      } else {
        setParsedWorkout({ ...data.workout, _screenshotUrl: data.screenshot_url });
      }
    } catch (err) {
      setParseError('Import failed. Please try again.');
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div style={{ padding: '20px 16px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '26px', color: 'var(--text-primary)', margin: 0 }}>
          Workouts
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '8px 12px', color: 'var(--text-muted)',
              cursor: importing ? 'not-allowed' : 'pointer', fontSize: '13px',
              fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500,
            } as any}
          >
            <Camera size={14} />
            {importing ? 'Parsing...' : 'Import Screenshot'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleImageImport} style={{ display: 'none' }} />
          <Link
            href="/workouts/new"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'var(--accent)', color: '#0A0A0A',
              borderRadius: '8px', padding: '8px 12px',
              fontSize: '13px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700,
              textDecoration: 'none',
            } as any}
          >
            <Plus size={14} /> New
          </Link>
        </div>
      </div>

      {parseError && (
        <div style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid #FF444433', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#FF4444', fontSize: '14px' }}>
          {parseError}
        </div>
      )}

      {parsedWorkout && (
        <div style={{ background: 'rgba(232,255,61,0.08)', border: '1px solid rgba(232,255,61,0.3)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '14px', color: 'var(--accent)', margin: 0 }}>
              ✓ Workout parsed — review before saving
            </p>
            <button onClick={() => setParsedWorkout(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '16px' }}>×</button>
          </div>
          <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '16px', color: 'var(--text-primary)', margin: '0 0 8px' }}>
            {parsedWorkout.name}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 12px' }}>
            {parsedWorkout.blocks?.length} blocks · {parsedWorkout.type}
          </p>
          <Link
            href={`/workouts/new?import=${encodeURIComponent(JSON.stringify(parsedWorkout))}`}
            style={{
              display: 'inline-block',
              background: 'var(--accent)', color: '#0A0A0A',
              borderRadius: '8px', padding: '10px 16px',
              fontSize: '14px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700,
              textDecoration: 'none',
            } as any}
          >Review & Save →</Link>
        </div>
      )}

      {workouts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏋️</div>
          <p style={{ fontSize: '15px', marginBottom: '16px' }}>No workouts yet.</p>
          <Link href="/workouts/new" style={{ background: 'var(--accent)', color: '#0A0A0A', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, textDecoration: 'none' } as any}>
            Create Your First Workout
          </Link>
        </div>
      )}

      <div style={{ display: 'grid', gap: '8px' }}>
        {workouts.map(w => (
          <Link
            key={w.id}
            href={`/workouts/${w.id}`}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: '12px', padding: '14px 16px', textDecoration: 'none',
            } as any}
          >
            <span style={{ fontSize: '24px' }}>{typeEmoji[w.type] || '🏃'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', marginBottom: '2px' }}>{w.name}</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ background: (typeColors[w.type] || '#888') + '22', color: typeColors[w.type] || '#888', borderRadius: '4px', padding: '1px 6px', fontSize: '10px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700 }}>{w.type.toUpperCase()}</span>
                {w.estimated_duration_min && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '12px', color: 'var(--text-dim)' }}>
                    <Clock size={10} />{w.estimated_duration_min}min
                  </span>
                )}
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{format(new Date(w.created_at), 'MMM d')}</span>
              </div>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
          </Link>
        ))}
      </div>
    </div>
  );
}
