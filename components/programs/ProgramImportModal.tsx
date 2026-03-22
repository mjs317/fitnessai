'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X, CheckCircle, AlertCircle, Download } from 'lucide-react';

type Step = 'idle' | 'uploading' | 'preview' | 'confirming' | 'done' | 'error';

interface WorkoutsByType {
  [type: string]: number;
}

interface FirstWeekDay {
  week: number;
  day: string;
  scheduledDate: string;
  workout: {
    name: string;
    type: string;
    duration_min: number | null;
  };
}

interface PreviewData {
  name: string;
  sport: string;
  weeks: number;
  startDate: string;
  description: string;
  totalWorkouts: number;
  totalRestDays: number;
  workoutsByType: WorkoutsByType;
  firstWeekPreview: FirstWeekDay[];
}

interface ProgramImportModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  hasActivePlan?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  strength: '#E8FF3D',
  run: '#22C55E',
  bike: '#3B82F6',
  swim: '#06B6D4',
  hyrox: '#F97316',
  hiit: '#A855F7',
  rest: '#888888',
  active_recovery: '#888888',
  mixed: '#E8FF3D',
};

export default function ProgramImportModal({ open, onClose, onSuccess, hasActivePlan }: ProgramImportModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [programData, setProgramData] = useState<unknown>(null);
  const [doneInfo, setDoneInfo] = useState<{ name: string; weeks: number; days: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setStep('idle');
    setError('');
    setPreview(null);
    setProgramData(null);
    onClose();
  };

  const uploadFile = useCallback(async (file: File) => {
    setStep('uploading');
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/programs/import', { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Failed to parse file');
        setStep('error');
        return;
      }
      setPreview(json.preview);
      setProgramData(json.programData);
      setStep('preview');
    } catch {
      setError('Network error — please try again');
      setStep('error');
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleConfirm = async () => {
    if (!programData || !preview) return;
    setStep('confirming');
    try {
      const res = await fetch('/api/programs/import?action=confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programData }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Failed to save program');
        setStep('error');
        return;
      }
      setDoneInfo({ name: preview.name, weeks: preview.weeks, days: json.daysScheduled });
      setStep('done');
    } catch {
      setError('Network error — please try again');
      setStep('error');
    }
  };

  const handleDoneClose = () => {
    handleClose();
    onSuccess();
    router.refresh();
  };

  if (!open) return null;

  return (
    <div
      onClick={handleClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '16px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 20px 0' }}>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)', margin: 0 }}>
            Import Workout Program
          </h2>
          <button onClick={handleClose} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: '20px' }}>

          {/* ── IDLE ─────────────────────────────────────────────────────── */}
          {step === 'idle' && (
            <>
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: '12px',
                  padding: '40px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: isDragging ? 'rgba(232,255,61,0.04)' : 'var(--bg-surface)',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <Upload size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', margin: '0 0 4px' }}>
                  Drop your file here
                </p>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
                  or click to browse — .xlsx or .csv
                </p>
                <div style={{ display: 'inline-block', background: 'var(--accent)', color: '#0A0A0A', borderRadius: '8px', padding: '8px 18px', fontSize: '13px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700 }}>
                  Upload &amp; Preview
                </div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.csv" style={{ display: 'none' }} onChange={handleFileSelect} />
              </div>

              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Download size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                  Use the Fitness Coach template —{' '}
                  <a href="/api/programs/template" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                    Download Template
                  </a>
                  . Place the downloaded file at{' '}
                  <code style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-surface)', padding: '1px 4px', borderRadius: '3px' }}>
                    public/templates/FitnessCoach_WorkoutProgram_Template.xlsx
                  </code>{' '}
                  in your project.
                </p>
              </div>
            </>
          )}

          {/* ── UPLOADING ────────────────────────────────────────────────── */}
          {step === 'uploading' && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ width: '40px', height: '40px', border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>Parsing your program…</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ── PREVIEW ──────────────────────────────────────────────────── */}
          {step === 'preview' && preview && (
            <>
              {hasActivePlan && (
                <div style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.4)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#FBBF24', fontFamily: 'Space Grotesk, sans-serif' }}>
                  ⚠ This will replace your current active plan
                </div>
              )}

              {/* Summary card */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
                {/* Program info */}
                <div style={{ padding: '16px' }}>
                  <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '17px', color: 'var(--text-primary)', margin: '0 0 4px' }}>{preview.name}</p>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 8px', fontFamily: 'DM Sans, sans-serif' }}>
                    {preview.sport} · {preview.weeks} week{preview.weeks !== 1 ? 's' : ''} · starts {preview.startDate}
                  </p>
                  {preview.description && (
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5 }}>{preview.description}</p>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px' }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 10px', fontFamily: 'Space Grotesk, sans-serif' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{preview.totalWorkouts}</strong> workouts &nbsp;·&nbsp; <strong style={{ color: 'var(--text-primary)' }}>{preview.totalRestDays}</strong> rest days
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {Object.entries(preview.workoutsByType).map(([type, count]) => {
                      const total = preview.totalWorkouts + preview.totalRestDays;
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '11px', color: 'var(--text-muted)', width: '80px', textTransform: 'capitalize' }}>{type}</span>
                          <div style={{ flex: 1, height: '6px', background: 'var(--bg-elevated)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: TYPE_COLORS[type] || '#888', borderRadius: '3px' }} />
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: '20px', textAlign: 'right' }}>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Week 1 preview */}
                {preview.firstWeekPreview.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px' }}>
                    <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>Week 1 Preview</p>
                    {preview.firstWeekPreview.map((d, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '11px', color: 'var(--text-muted)', width: '28px' }}>{d.day}</span>
                        <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '13px', color: 'var(--text-primary)', flex: 1 }}>{d.workout.name}</span>
                        <span style={{ fontSize: '11px', color: TYPE_COLORS[d.workout.type] || 'var(--text-muted)', textTransform: 'capitalize', fontFamily: 'Space Grotesk, sans-serif' }}>{d.workout.type}</span>
                        {d.workout.duration_min && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{d.workout.duration_min}min</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleClose} style={{ flex: 1, padding: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleConfirm} style={{ flex: 2, padding: '12px', background: 'var(--accent)', border: 'none', borderRadius: '10px', color: '#0A0A0A', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
                  Import Program →
                </button>
              </div>
            </>
          )}

          {/* ── CONFIRMING ───────────────────────────────────────────────── */}
          {step === 'confirming' && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ width: '40px', height: '40px', border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>Saving your program…</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* ── DONE ─────────────────────────────────────────────────────── */}
          {step === 'done' && doneInfo && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <CheckCircle size={48} style={{ color: '#22C55E', margin: '0 auto 16px' }} />
              <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)', margin: '0 0 6px' }}>
                {doneInfo.name} imported!
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 24px', fontFamily: 'DM Sans, sans-serif' }}>
                {doneInfo.days} workouts scheduled across {doneInfo.weeks} week{doneInfo.weeks !== 1 ? 's' : ''}
              </p>
              <button onClick={handleDoneClose} style={{ padding: '12px 28px', background: 'var(--accent)', border: 'none', borderRadius: '10px', color: '#0A0A0A', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
                Close
              </button>
            </div>
          )}

          {/* ── ERROR ────────────────────────────────────────────────────── */}
          {step === 'error' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <AlertCircle size={48} style={{ color: '#FF4444', margin: '0 auto 16px' }} />
              <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '17px', color: 'var(--text-primary)', margin: '0 0 8px' }}>
                Import failed
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 24px', fontFamily: 'DM Sans, sans-serif', maxWidth: '360px', marginLeft: 'auto', marginRight: 'auto' }}>
                {error}
              </p>
              <button onClick={() => setStep('idle')} style={{ padding: '12px 28px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text-primary)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}>
                Try Again
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
