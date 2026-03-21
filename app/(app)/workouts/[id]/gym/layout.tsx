// Override the app layout for gym mode — no nav, full screen
export default function GymLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--bg-base)',
      overflowY: 'auto',
      zIndex: 200,
    }}>
      {children}
    </div>
  );
}
