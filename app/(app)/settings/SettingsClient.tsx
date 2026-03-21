'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { Check, RefreshCw, Link as LinkIcon, Unlink, LogOut } from 'lucide-react';

interface SettingsProps {
  userEmail: string;
  initialSettings: Record<string, any>;
}

const inputStyle = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px',
  padding: '10px 12px', color: 'var(--text-primary)', fontSize: '14px',
  fontFamily: 'DM Sans, sans-serif', outline: 'none', width: '100%',
} as const;

const labelStyle = {
  display: 'block', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'Space Grotesk, sans-serif',
  fontWeight: 500, marginBottom: '5px', textTransform: 'uppercase' as const, letterSpacing: '0.05em',
};

const sectionStyle = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: '12px', padding: '20px', marginBottom: '16px',
};

const sectionTitle = {
  fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '15px',
  color: 'var(--text-primary)', margin: '0 0 16px',
};

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: connected ? '#22C55E' : '#FF4444', marginRight: '6px', flexShrink: 0 }} />
  );
}

function formatLastSync(ts: string | null | undefined): string {
  if (!ts) return 'Never';
  try {
    const d = parseISO(ts);
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 2) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return format(d, 'MMM d');
  } catch { return 'Unknown'; }
}

function SettingsInner({ userEmail, initialSettings }: SettingsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [settings, setSettings] = useState(initialSettings);
  const [garminEmail, setGarminEmail] = useState(initialSettings.garmin_email || '');
  const [garminPassword, setGarminPassword] = useState('');
  const [garminStatus, setGarminStatus] = useState('');
  const [tpUrl, setTpUrl] = useState(initialSettings.trainingpeaks_ics_url || '');
  const [tpStatus, setTpStatus] = useState('');
  const [syncing, setSyncing] = useState<string | null>(null);
  const [historicalProgress, setHistoricalProgress] = useState<{ day: number; total: number; imported: number } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Show Withings connection status from URL params
  useEffect(() => {
    const withings = searchParams.get('withings');
    if (withings === 'connected') setGarminStatus('Withings connected successfully!');
    if (withings === 'error') setGarminStatus('Withings connection failed. Please try again.');
  }, [searchParams]);

  const saveGarminCredentials = async () => {
    if (!garminEmail || !garminPassword) return;
    setSyncing('garmin-save');
    try {
      const res = await fetch('/api/garmin/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: garminEmail, password: garminPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setGarminPassword('');
        setSettings(s => ({ ...s, garmin_email: garminEmail }));
        setGarminStatus('✓ Garmin credentials saved and connection verified');
      } else {
        setGarminStatus('✗ ' + (data.error || 'Save failed'));
      }
    } catch (err: any) {
      setGarminStatus('✗ ' + err.message);
    }
    setSyncing(null);
  };

  const syncNow = async (type: 'garmin' | 'withings' | 'trainingpeaks') => {
    setSyncing(type);
    try {
      const endpoint = type === 'trainingpeaks' ? '/api/trainingpeaks/sync' : `/api/${type}/sync`;
      const res = await fetch(endpoint);
      const data = await res.json();
      if (data.success) {
        setSettings(s => ({ ...s, [`${type}_last_sync`]: new Date().toISOString() }));
        setSaved(type);
        setTimeout(() => setSaved(null), 2000);
      } else {
        setGarminStatus('Sync failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      setGarminStatus('Sync error: ' + err.message);
    }
    setSyncing(null);
  };

  const importHistory = async () => {
    setSyncing('historical');
    setHistoricalProgress({ day: 0, total: 90, imported: 0 });
    try {
      const res = await fetch('/api/garmin/historical', { method: 'POST' });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) { setSettings(s => ({ ...s, garmin_historical_seeded: true })); break; }
            if (data.day) setHistoricalProgress({ day: data.day, total: data.total, imported: data.imported });
          } catch {}
        }
      }
    } catch (err: any) {
      setGarminStatus('History import failed: ' + err.message);
    }
    setSyncing(null);
    setHistoricalProgress(null);
  };

  const saveTPUrl = async () => {
    if (!tpUrl) return;
    setSyncing('tp-save');
    // Test URL
    try {
      const testRes = await fetch('/api/trainingpeaks/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: tpUrl }),
      });
      const test = await testRes.json();
      if (!test.success) { setTpStatus('✗ ' + (test.error || 'Invalid .ics URL')); setSyncing(null); return; }

      // Save to user_settings
      const { error } = await supabase.from('user_settings').upsert({ user_id: (await supabase.auth.getUser()).data.user?.id, trainingpeaks_ics_url: tpUrl, updated_at: new Date().toISOString() });
      if (error) { setTpStatus('✗ Save failed'); }
      else {
        setSettings(s => ({ ...s, trainingpeaks_ics_url: tpUrl }));
        setTpStatus('✓ ' + test.message + ' — syncing now...');
        await syncNow('trainingpeaks');
        setTpStatus('✓ TrainingPeaks connected and synced');
      }
    } catch (err: any) {
      setTpStatus('✗ ' + err.message);
    }
    setSyncing(null);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const exportData = async () => {
    // Simple data export — opens a new tab to download JSON
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [metrics, logs, meals] = await Promise.all([
      supabase.from('health_metrics').select('*').eq('user_id', user.id),
      supabase.from('workout_logs').select('*').eq('user_id', user.id),
      supabase.from('meal_logs').select('*').eq('user_id', user.id),
    ]);
    const blob = new Blob([JSON.stringify({ health_metrics: metrics.data, workout_logs: logs.data, meal_logs: meals.data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitnesscoach-export-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '20px 16px', maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '26px', color: 'var(--text-primary)', margin: 0 }}>Settings</h1>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{userEmail}</span>
      </div>

      {garminStatus && (
        <div style={{ background: garminStatus.startsWith('✓') ? 'rgba(34,197,94,0.1)' : 'rgba(255,68,68,0.1)', border: `1px solid ${garminStatus.startsWith('✓') ? '#22C55E33' : '#FF444433'}`, borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '14px', color: garminStatus.startsWith('✓') ? '#22C55E' : '#FF4444' }}>
          {garminStatus}
        </div>
      )}

      {/* Garmin */}
      <div style={sectionStyle}>
        <h2 style={sectionTitle}>Garmin Connect</h2>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '14px' }}>
          <StatusDot connected={!!settings.garmin_email} />
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {settings.garmin_email ? `${settings.garmin_email} · Last sync: ${formatLastSync(settings.garmin_last_sync)}` : 'Not connected'}
          </span>
        </div>
        <div style={{ display: 'grid', gap: '10px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" value={garminEmail} onChange={e => setGarminEmail(e.target.value)} style={inputStyle} placeholder="garmin@email.com" autoComplete="off" />
          </div>
          <div>
            <label style={labelStyle}>Password (encrypted at rest)</label>
            <input type="password" value={garminPassword} onChange={e => setGarminPassword(e.target.value)} style={inputStyle} placeholder="••••••••" autoComplete="new-password" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={saveGarminCredentials} disabled={!garminEmail || !garminPassword || syncing === 'garmin-save'} style={{ flex: 1, minHeight: '44px', background: 'var(--accent)', color: '#0A0A0A', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', cursor: (!garminEmail || !garminPassword) ? 'not-allowed' : 'pointer', opacity: (!garminEmail || !garminPassword) ? 0.5 : 1 }}>
            {syncing === 'garmin-save' ? 'Saving...' : 'Save Credentials'}
          </button>
          {settings.garmin_email && (
            <>
              <button onClick={() => syncNow('garmin')} disabled={!!syncing} style={{ minHeight: '44px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 14px', color: syncing === 'garmin' ? 'var(--accent)' : 'var(--text-muted)', cursor: syncing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontFamily: 'Space Grotesk, sans-serif' }}>
                <RefreshCw size={13} /> {syncing === 'garmin' ? 'Syncing...' : 'Sync Now'}
              </button>
              {!settings.garmin_historical_seeded && (
                <button onClick={importHistory} disabled={!!syncing} style={{ minHeight: '44px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 14px', color: 'var(--text-muted)', cursor: syncing ? 'not-allowed' : 'pointer', fontSize: '13px', fontFamily: 'Space Grotesk, sans-serif' }}>
                  {syncing === 'historical' ? 'Importing...' : 'Import 90-Day History'}
                </button>
              )}
            </>
          )}
        </div>
        {historicalProgress && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              <span>Importing history... {historicalProgress.day}/{historicalProgress.total}</span>
              <span>{historicalProgress.imported} days imported</span>
            </div>
            <div style={{ height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px' }}>
              <div style={{ height: '100%', width: `${(historicalProgress.day / historicalProgress.total) * 100}%`, background: 'var(--accent)', borderRadius: '2px', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Withings */}
      <div style={sectionStyle}>
        <h2 style={sectionTitle}>Withings Scale</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <StatusDot connected={!!settings.withings_access_token} />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {settings.withings_access_token ? `Connected · Last sync: ${formatLastSync(settings.withings_last_sync)}` : 'Not connected'}
            </span>
          </div>
          {settings.withings_access_token && (
            <button onClick={() => syncNow('withings')} disabled={!!syncing} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', color: 'var(--text-muted)', cursor: syncing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontFamily: 'Space Grotesk, sans-serif' }}>
              <RefreshCw size={12} /> Sync
            </button>
          )}
        </div>
        {!settings.withings_access_token ? (
          <a href="/api/withings/connect" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--accent)', color: '#0A0A0A', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, textDecoration: 'none' }}>
            <LinkIcon size={14} /> Connect Withings
          </a>
        ) : (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            Weight data syncs automatically daily. <a href="#" onClick={async e => { e.preventDefault(); await supabase.from('user_settings').update({ withings_access_token: null, withings_refresh_token: null, withings_token_expires_at: null }).eq('user_id', (await supabase.auth.getUser()).data.user?.id || ''); setSettings(s => ({ ...s, withings_access_token: null })); }} style={{ color: '#FF4444', textDecoration: 'underline', cursor: 'pointer' }}>Disconnect</a>
          </p>
        )}
      </div>

      {/* TrainingPeaks */}
      <div style={sectionStyle}>
        <h2 style={sectionTitle}>TrainingPeaks Calendar</h2>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '14px' }}>
          <StatusDot connected={!!settings.trainingpeaks_ics_url} />
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {settings.trainingpeaks_ics_url ? `Connected · Last sync: ${formatLastSync(settings.trainingpeaks_last_sync)}` : 'Not connected'}
          </span>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label style={labelStyle}>Calendar Feed URL (.ics)</label>
          <input
            type="url"
            value={tpUrl}
            onChange={e => setTpUrl(e.target.value)}
            style={inputStyle}
            placeholder="https://app.trainingpeaks.com/feeds/calendar/..."
          />
          <p style={{ fontSize: '11px', color: 'var(--text-dim)', margin: '4px 0 0' }}>
            TrainingPeaks → Calendar → Share → Copy iCal Link
          </p>
        </div>
        {tpStatus && <p style={{ fontSize: '13px', color: tpStatus.startsWith('✓') ? '#22C55E' : '#FF4444', marginBottom: '8px' }}>{tpStatus}</p>}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={saveTPUrl} disabled={!tpUrl || syncing === 'tp-save'} style={{ flex: 1, minHeight: '44px', background: 'var(--accent)', color: '#0A0A0A', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', cursor: !tpUrl ? 'not-allowed' : 'pointer', opacity: !tpUrl ? 0.5 : 1 }}>
            {syncing === 'tp-save' ? 'Testing...' : 'Test & Save'}
          </button>
          {settings.trainingpeaks_ics_url && (
            <button onClick={() => syncNow('trainingpeaks')} disabled={!!syncing} style={{ minHeight: '44px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 14px', color: 'var(--text-muted)', cursor: syncing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontFamily: 'Space Grotesk, sans-serif' }}>
              <RefreshCw size={13} /> Sync
            </button>
          )}
        </div>
      </div>

      {/* Account */}
      <div style={sectionStyle}>
        <h2 style={sectionTitle}>Account</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={exportData} style={{ minHeight: '44px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 16px', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '13px' }}>
            Export Data (JSON)
          </button>
          <button onClick={handleSignOut} style={{ minHeight: '44px', background: 'rgba(255,68,68,0.1)', border: '1px solid #FF444433', borderRadius: '8px', padding: '0 16px', color: '#FF4444', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsClient(props: SettingsProps) {
  return (
    <Suspense fallback={<div style={{ padding: '20px', color: 'var(--text-muted)' }}>Loading settings...</div>}>
      <SettingsInner {...props} />
    </Suspense>
  );
}
