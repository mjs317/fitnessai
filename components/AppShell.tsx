'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Calendar, Dumbbell, Settings } from 'lucide-react';

const navItems = [
  { href: '/today', icon: Home, label: 'Today' },
  { href: '/training', icon: Calendar, label: 'Training' },
  { href: '/workouts', icon: Dumbbell, label: 'Workouts' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Desktop sidebar */}
      <aside style={{
        display: 'none',
        width: '220px',
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        padding: '24px 16px',
        flexDirection: 'column',
        gap: '4px',
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        zIndex: 10,
      }} className="desktop-sidebar">
        <div style={{ padding: '8px 12px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '18px', color: 'var(--accent)' }}>FC</span>
            <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '18px', color: 'var(--text-primary)', marginLeft: '8px' }}>Fitness Coach</span>
          </div>
          <Link href="/settings" style={{ color: 'var(--text-dim)', display: 'flex', alignItems: 'center' }}>
            <Settings size={16} />
          </Link>
        </div>
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link key={href} href={href} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 12px', borderRadius: '8px',
              background: active ? 'rgba(232,255,61,0.1)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-muted)',
              textDecoration: 'none',
              fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, fontSize: '14px',
            }}>
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </aside>

      <main style={{ flex: 1, paddingBottom: '80px', minHeight: '100vh' }} className="app-main">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--bg-surface)', borderTop: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-around',
        padding: '8px 0 max(8px, env(safe-area-inset-bottom))',
        zIndex: 50,
      }} className="mobile-nav">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link key={href} href={href} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              padding: '4px 20px',
              color: active ? 'var(--accent)' : 'var(--text-dim)',
              textDecoration: 'none', fontSize: '10px',
              fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500,
            }}>
              <Icon size={22} strokeWidth={active ? 2.5 : 1.5} />
              {label}
            </Link>
          );
        })}
        <Link href="/settings" style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
          padding: '4px 20px',
          color: pathname.startsWith('/settings') ? 'var(--accent)' : 'var(--text-dim)',
          textDecoration: 'none', fontSize: '10px',
          fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500,
        }}>
          <Settings size={22} strokeWidth={pathname.startsWith('/settings') ? 2.5 : 1.5} />
          Settings
        </Link>
      </nav>
    </div>
  );
}
