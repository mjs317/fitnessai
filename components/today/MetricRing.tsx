'use client';

interface MetricRingProps {
  label: string;
  value: number | null;
  max: number;
  unit: string;
  thresholds: { green: number; yellow: number }; // >= green = green, >= yellow = yellow, else red
  size?: number;
}

function getStatusColor(value: number | null, thresholds: { green: number; yellow: number }): string {
  if (value === null) return '#444444';
  if (value >= thresholds.green) return '#22C55E';
  if (value >= thresholds.yellow) return '#FF9500';
  return '#FF4444';
}

export default function MetricRing({
  label,
  value,
  max,
  unit,
  thresholds,
  size = 96,
}: MetricRingProps) {
  const color = getStatusColor(value, thresholds);
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = value !== null ? Math.min(value / max, 1) : 0;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '6px',
    }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg
          width={size}
          height={size}
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#2A2A2A"
            strokeWidth={8}
          />
          {/* Progress */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
          />
        </svg>
        {/* Center value */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontWeight: 700,
            fontSize: size >= 96 ? '22px' : '18px',
            color: value !== null ? 'var(--text-primary)' : 'var(--text-dim)',
            lineHeight: 1,
          }}>
            {value !== null ? value : '—'}
          </span>
          <span style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            fontFamily: 'Space Grotesk, sans-serif',
            lineHeight: 1,
            marginTop: '2px',
          }}>{unit}</span>
        </div>
      </div>
      <span style={{
        fontSize: '11px',
        fontWeight: 500,
        color: 'var(--text-muted)',
        fontFamily: 'Space Grotesk, sans-serif',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}>{label}</span>
    </div>
  );
}
