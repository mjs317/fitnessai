const pulse = {
  animation: 'pulse 1.5s ease-in-out infinite',
  background: 'linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-elevated) 50%, var(--bg-surface) 75%)',
  backgroundSize: '200% 100%',
} as const;

export default function TrainingLoading() {
  return (
    <div style={{ padding: '20px 16px', maxWidth: '800px', margin: '0 auto' }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <div style={{ ...pulse, width: '160px', height: '28px', borderRadius: '6px', marginBottom: '24px' }} />

      {/* Calendar grid skeleton: 7 columns, 2 rows */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '16px',
      }}>
        <div style={{ ...pulse, width: '120px', height: '14px', borderRadius: '4px', marginBottom: '16px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} style={{
              ...pulse,
              height: '48px',
              borderRadius: '8px',
            }} />
          ))}
        </div>
      </div>

      {/* Upcoming workouts list */}
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          ...pulse,
          height: '64px',
          borderRadius: '12px',
          marginBottom: '8px',
        }} />
      ))}
    </div>
  );
}
