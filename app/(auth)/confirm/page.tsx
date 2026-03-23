'use client';

// Handles magic link redirects on any device.
// Supabase sends #access_token=... (implicit flow) — the browser client reads
// the hash automatically, no PKCE cookie required, so cross-device login works.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function ConfirmPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    // onAuthStateChange fires automatically when the browser client detects
    // the #access_token hash fragment in the URL.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        router.replace('/today');
      }
    });

    // Also check immediately (handles cases where event already fired)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/today');
      } else {
        // Give it 3s for the hash fragment to be processed, then show error
        setTimeout(() => setStatus('error'), 3000);
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  if (status === 'error') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ textAlign: 'center', maxWidth: '360px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '20px', color: 'var(--text-primary)', margin: '0 0 10px' }}>Link expired</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>This magic link has expired or already been used. Request a new one.</p>
          <a href="/login" style={{ background: 'var(--accent)', color: '#0A0A0A', borderRadius: '8px', padding: '12px 24px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '15px', textDecoration: 'none' }}>
            Back to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚡</div>
        <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '16px', color: 'var(--text-primary)' }}>Signing you in…</p>
      </div>
    </div>
  );
}
