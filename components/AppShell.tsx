'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Utensils, Calendar, Dumbbell, Settings } from 'lucide-react';

const navItems = [
  { href: '/today', icon: Home, label: 'Today' },
  { href: '/nutrition', icon: Utensils, label: 'Nutrition' },
  { href: '/training', icon: Calendar, label: 'Training' },
  { href: '/workouts', icon: Dumbbell, label: 'Workouts' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-base)',
    }}>
      <aside style={{
        display: 'none',
        width: '220px',
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        padding: '24px 16px',
        flexDirection: 'column',
        gap: '4px',
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 10,
      }} className="desktop-sidebar">
        <div style={{ padding: '8px 12px', marginBottom: '24px' }}>
          <span style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontWeight: 700,
            fontSize: '18px',
            color: 'var(--accent)',
          }}>FC</span>
          <span style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontWeight: 500,
            fontSize: '18px',
            color: 'var(--text-primary)',
            marginLeft: '8px',
          }}>Fitness Coach</span>
        </div>
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: active ? 'rgba(232,255,61,0.1)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                textDecoration: 'none',
                fontFamily: 'Space Grotesk, sans-serif',
                fontWeight: 500,
                fontSize: '14px',
                transition: 'all 0.15s',
              }}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </aside>

      <main style={{
        flex: 1,
        paddingBottom: '80px',
        minHeight: '100vh',
      }} className="app-main">
        {children}
      </main>

      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-around',
        padding: '8px 0 max(8px, env(safe-area-inset-bottom))',
        zIndex: 50,
      }} className="mobile-nav">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 16px',
                color: active ? 'var(--accent)' : 'var(--text-dim)',
                textDecoration: 'none',
                fontSize: '10px',
                fontFamily: 'Space Grotesk, sans-serif',
                fontWeight: 500,
              }}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.5} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
