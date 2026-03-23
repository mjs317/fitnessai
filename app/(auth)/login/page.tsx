'use client';

import { useState, Suspense } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '400px',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '40px 32px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--text-muted)',
  fontSize: '12px',
  fontWeight: 500,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  marginBottom: '8px',
  fontFamily: 'Space Grotesk, sans-serif',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '12px 16px',
  color: 'var(--text-primary)',
  fontSize: '16px',
  outline: 'none',
  fontFamily: 'DM Sans, sans-serif',
};

const btnStyle = (loading: boolean): React.CSSProperties => ({
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
  marginTop: '4px',
});

function LoginForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Use implicit flow so the magic link works on ANY device/browser — no PKCE
  // cookie required. The /auth/confirm page reads the #access_token hash client-side.
  const getSupabase = () => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: 'implicit' } },
  );

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await getSupabase().auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/confirm`,
      },
    });
    if (error) setError(error.message);
    else setSent(true);
    setLoading(false);
  };

  const handleResend = async () => {
    setLoading(true);
    setError('');
    const { error } = await getSupabase().auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/confirm`,
      },
    });
    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={cardStyle}>
        {/* Logo */}
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', background: 'var(--accent)', borderRadius: '12px', marginBottom: '16px' }}>
            <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '22px', color: '#0A0A0A' }}>FC</span>
          </div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '24px', color: 'var(--text-primary)', margin: 0 }}>Fitness Coach</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '8px' }}>Your personal AI performance coach</p>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>📧</div>
            <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)', margin: '0 0 10px' }}>Check your email</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6, margin: '0 0 20px' }}>
              We sent a magic link to<br />
              <strong style={{ color: 'var(--text-primary)' }}>{email}</strong><br />
              <span style={{ fontSize: '13px' }}>Tap it from any device — it works everywhere.</span>
            </p>
            {error && <p style={{ color: '#FF4444', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}
            <button onClick={handleResend} disabled={loading} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', textDecoration: 'underline' }}>
              {loading ? 'Sending…' : 'Resend link'}
            </button>
            <br />
            <button onClick={() => { setSent(false); setError(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', marginTop: '8px', fontFamily: 'Space Grotesk, sans-serif' }}>
              ← Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSend}>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@example.com"
                style={inputStyle}
              />
            </div>
            {error && <p style={{ color: '#FF4444', fontSize: '14px', marginBottom: '12px' }}>{error}</p>}
            <button type="submit" disabled={loading} style={btnStyle(loading)}>
              {loading ? 'Sending…' : 'Send Magic Link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
