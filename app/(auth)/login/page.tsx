'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '40px 32px',
      }}>
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            background: 'var(--accent)',
            borderRadius: '12px',
            marginBottom: '16px',
          }}>
            <span style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontWeight: 700,
              fontSize: '22px',
              color: '#0A0A0A',
            }}>FC</span>
          </div>
          <h1 style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontWeight: 700,
            fontSize: '24px',
            color: 'var(--text-primary)',
            margin: 0,
          }}>Fitness Coach</h1>
          <p style={{
            color: 'var(--text-muted)',
            fontSize: '14px',
            marginTop: '8px',
          }}>Your personal AI performance coach</p>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>📧</div>
            <h2 style={{
              fontFamily: 'Space Grotesk, sans-serif',
              color: 'var(--text-primary)',
              marginBottom: '8px',
            }}>Check your email</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              We sent a magic link to <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>.
              Click it to sign in.
            </p>
          </div>
        ) : (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                color: 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 500,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                marginBottom: '8px',
                fontFamily: 'Space Grotesk, sans-serif',
              }}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                style={{
                  width: '100%',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  color: 'var(--text-primary)',
                  fontSize: '16px',
                  outline: 'none',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              />
            </div>
            {error && (
              <p style={{ color: 'var(--status-red)', fontSize: '14px', marginBottom: '12px' }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: 'var(--accent)',
                color: '#0A0A0A',
                border: 'none',
                borderRadius: '8px',
                padding: '14px',
                fontSize: '16px',
                fontWeight: 700,
                fontFamily: 'Space Grotesk, sans-serif',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                letterSpacing: '0.02em',
              }}
            >
              {loading ? 'Sending...' : 'Send Magic Link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
