const pulse = {
  animation: 'pulse 1.5s ease-in-out infinite',
  background: 'linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-elevated) 50%, var(--bg-surface) 75%)',
  backgroundSize: '200% 100%',
} as const;

function SkeletonRing() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <div style={{ ...pulse, width: '100px', height: '100px', borderRadius: '50%' }} />
      <div style={{ ...pulse, width: '40px', height: '10px', borderRadius: '4px' }} />
    </div>
  );
}

function SkeletonCard({ height = 80 }: { height?: number }) {
  return (
    <div style={{ ...pulse, height, borderRadius: '12px', marginBottom: '8px' }} />
  );
}

export default function TodayLoading() {
  return (
    <div style={{ padding: '20px 16px', maxWidth: '800px', margin: '0 auto' }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* Header skeleton */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ ...pulse, width: '80px', height: '12px', borderRadius: '4px', marginBottom: '8px' }} />
        <div style={{ ...pulse, width: '180px', height: '28px', borderRadius: '6px' }} />
      </div>

      {/* Metric rings */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '20px 16px',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '16px' }}>
          <SkeletonRing />
          <SkeletonRing />
          <SkeletonRing />
        </div>
        <div style={{ display: 'flex', gap: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <div style={{ ...pulse, width: '50px', height: '20px', borderRadius: '4px' }} />
            <div style={{ ...pulse, width: '30px', height: '10px', borderRadius: '4px' }} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <div style={{ ...pulse, width: '50px', height: '20px', borderRadius: '4px' }} />
            <div style={{ ...pulse, width: '30px', height: '10px', borderRadius: '4px' }} />
          </div>
        </div>
      </div>

      {/* AI Brief skeleton */}
      <SkeletonCard height={90} />

      {/* Workout cards */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ ...pulse, width: '120px', height: '10px', borderRadius: '4px', marginBottom: '8px' }} />
        <SkeletonCard height={80} />
        <SkeletonCard height={80} />
      </div>

      {/* Macro bars */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
        <div style={{ ...pulse, width: '140px', height: '10px', borderRadius: '4px', marginBottom: '16px' }} />
        {[0, 1, 2].map(i => (
          <div key={i} style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ ...pulse, width: '60px', height: '10px', borderRadius: '4px' }} />
              <div style={{ ...pulse, width: '50px', height: '10px', borderRadius: '4px' }} />
            </div>
            <div style={{ ...pulse, height: '6px', borderRadius: '3px' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
