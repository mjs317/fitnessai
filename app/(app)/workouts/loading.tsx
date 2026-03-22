const pulse = {
  animation: 'pulse 1.5s ease-in-out infinite',
  background: 'linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-elevated) 50%, var(--bg-surface) 75%)',
  backgroundSize: '200% 100%',
} as const;

export default function WorkoutsLoading() {
  return (
    <div style={{ padding: '20px 16px', maxWidth: '800px', margin: '0 auto' }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <div style={{ ...pulse, width: '130px', height: '28px', borderRadius: '6px', marginBottom: '24px' }} />

      {[0, 1, 2].map(i => (
        <div key={i} style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '10px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ ...pulse, width: '140px', height: '16px', borderRadius: '4px', marginBottom: '8px' }} />
              <div style={{ ...pulse, width: '90px', height: '11px', borderRadius: '4px' }} />
            </div>
            <div style={{ ...pulse, width: '70px', height: '32px', borderRadius: '8px' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
