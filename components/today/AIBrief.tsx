'use client';

import { useState } from 'react';

interface AIBriefProps {
  verdict: 'PUSH' | 'MAINTAIN' | 'RECOVER' | null;
  content: string | null;
  isLoading?: boolean;
  date: string;
}

const verdictConfig = {
  PUSH: { emoji: '🟢', color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
  MAINTAIN: { emoji: '🟡', color: '#FF9500', bg: 'rgba(255,149,0,0.1)' },
  RECOVER: { emoji: '🔴', color: '#FF4444', bg: 'rgba(255,68,68,0.1)' },
};

export default function AIBrief({ verdict, content, isLoading, date }: AIBriefProps) {
  const [expanded, setExpanded] = useState(false);

  const cfg = verdict ? verdictConfig[verdict] : null;
  const preview = content ? content.split('. ').slice(0, 2).join('. ') + '.' : null;

  if (isLoading) {
    return (
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{
            width: '80px',
            height: '24px',
            background: 'var(--bg-elevated)',
            borderRadius: '6px',
            animation: 'pulse 1.5s infinite',
          }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Generating brief...</span>
        </div>
        <div style={{
          height: '48px',
          background: 'var(--bg-elevated)',
          borderRadius: '8px',
          animation: 'pulse 1.5s infinite',
        }} />
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      </div>
    );
  }

  if (!verdict || !content) {
    return (
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '16px',
      }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
          No AI brief for today yet. Check back after syncing your data.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        onClick={() => setExpanded(true)}
        style={{
          background: 'var(--bg-surface)',
          border: `1px solid ${cfg?.color || 'var(--border)'}`,
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px',
          cursor: 'pointer',
          transition: 'border-color 0.2s',
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: cfg?.bg,
            borderRadius: '20px',
            padding: '4px 12px',
          }}>
            <span style={{ fontSize: '14px' }}>{cfg?.emoji}</span>
            <span style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontWeight: 700,
              fontSize: '13px',
              color: cfg?.color,
              letterSpacing: '0.08em',
            }}>{verdict}</span>
          </div>
          <span style={{
            fontSize: '11px',
            color: 'var(--text-dim)',
            fontFamily: 'Space Grotesk, sans-serif',
          }}>AI COACH · Tap to expand</span>
        </div>
        {/* Preview text */}
        <p style={{
          color: 'var(--text-muted)',
          fontSize: '14px',
          margin: 0,
          lineHeight: 1.5,
        }}>{preview}</p>
      </div>

      {/* Expanded modal overlay */}
      {expanded && (
        <div
          onClick={() => setExpanded(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'flex-end',
            padding: '0',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-elevated)',
              borderRadius: '16px 16px 0 0',
              padding: '24px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: cfg?.bg,
                borderRadius: '20px',
                padding: '6px 14px',
              }}>
                <span style={{ fontSize: '16px' }}>{cfg?.emoji}</span>
                <span style={{
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontWeight: 700,
                  fontSize: '14px',
                  color: cfg?.color,
                  letterSpacing: '0.08em',
                }}>{verdict}</span>
              </div>
              <button
                onClick={() => setExpanded(false)}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >×</button>
            </div>
            <div style={{
              fontFamily: 'DM Sans, sans-serif',
              fontSize: '15px',
              color: 'var(--text-primary)',
              lineHeight: 1.7,
              whiteSpace: 'pre-line',
            }}>
              {content}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
