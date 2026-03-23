'use client';

import { useState, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Step 1 — send OTP
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) {
      setError(error.message);
    } else {
      setStep('code');
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
    setLoading(false);
  };

  // Step 2 — verify 6-digit code
  const handleVerify = async (fullCode?: string) => {
    const token = fullCode ?? code.join('');
    if (token.length < 6) return;
    setLoading(true);
    setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) {
      setError('Incorrect code. Please check your email and try again.');
      setCode(['', '', '', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } else {
      router.push('/today');
      router.refresh();
    }
    setLoading(false);
  };

  // Handle digit input with auto-advance
  const handleDigit = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...code];
    next[idx] = digit;
    setCode(next);
    if (digit && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
    }
    if (next.every(d => d !== '')) {
      handleVerify(next.join(''));
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(''));
      handleVerify(pasted);
    }
  };

  const Logo = () => (
    <div style={{ marginBottom: '32px', textAlign: 'center' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', background: 'var(--accent)', borderRadius: '12px', marginBottom: '16px' }}>
        <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '22px', color: '#0A0A0A' }}>FC</span>
      </div>
      <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '24px', color: 'var(--text-primary)', margin: 0 }}>Fitness Coach</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '8px' }}>Your personal AI performance coach</p>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={cardStyle}>
        <Logo />

        {step === 'email' ? (
          <form onSubmit={handleSendCode}>
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
              {loading ? 'Sending...' : 'Send Code'}
            </button>
          </form>
        ) : (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>📨</div>
              <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', margin: '0 0 6px' }}>Check your email</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
                Enter the 6-digit code sent to<br />
                <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>
              </p>
            </div>

            {/* 6-digit code boxes */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }} onPaste={handlePaste}>
              {code.map((digit, idx) => (
                <input
                  key={idx}
                  ref={el => { inputRefs.current[idx] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleDigit(idx, e.target.value)}
                  onKeyDown={e => handleKeyDown(idx, e)}
                  style={{
                    width: '44px', height: '56px',
                    background: 'var(--bg-elevated)',
                    border: digit ? '2px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: '10px',
                    color: 'var(--text-primary)',
                    fontSize: '24px',
                    fontFamily: 'Space Grotesk, sans-serif',
                    fontWeight: 700,
                    textAlign: 'center',
                    outline: 'none',
                  }}
                />
              ))}
            </div>

            {error && <p style={{ color: '#FF4444', fontSize: '13px', textAlign: 'center', marginBottom: '12px' }}>{error}</p>}

            <button
              onClick={() => handleVerify()}
              disabled={loading || code.some(d => !d)}
              style={btnStyle(loading || code.some(d => !d))}
            >
              {loading ? 'Verifying...' : 'Verify Code'}
            </button>

            <button
              onClick={() => { setStep('email'); setCode(['', '', '', '', '', '']); setError(''); }}
              style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', marginTop: '14px', fontFamily: 'Space Grotesk, sans-serif' }}
            >
              ← Use a different email
            </button>

            <button
              onClick={handleSendCode as any}
              disabled={loading}
              style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', marginTop: '6px', fontFamily: 'Space Grotesk, sans-serif' }}
            >
              Resend code
            </button>
          </div>
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
