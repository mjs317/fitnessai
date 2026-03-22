'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ background: '#0A0A0A', margin: 0, fontFamily: 'sans-serif' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '20px',
        }}>
          <div style={{
            background: '#141414',
            border: '1px solid #2A2A2A',
            borderRadius: '12px',
            padding: '40px',
            textAlign: 'center',
            maxWidth: '400px',
            width: '100%',
          }}>
            <div style={{ fontSize: '32px', color: '#E8FF3D', marginBottom: '16px' }}>⚠️</div>
            <h2 style={{
              fontFamily: 'Space Grotesk, sans-serif',
              fontWeight: 700,
              fontSize: '20px',
              color: '#F5F5F5',
              margin: '0 0 8px',
            }}>Something went wrong</h2>
            <p style={{
              fontSize: '13px',
              color: '#888888',
              margin: '0 0 24px',
              lineHeight: 1.5,
            }}>{error.message || 'An unexpected error occurred.'}</p>
            <button
              onClick={reset}
              style={{
                background: '#E8FF3D',
                color: '#0A0A0A',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 24px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
