import { ImageResponse } from 'next/og';

export const alt = 'Corpus — Learn words from real life.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '76px',
        background: '#f3f0e8',
        color: '#1c1a16',
        fontFamily: 'serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: 36 }}>
        <div style={{ width: 28, height: 28, background: '#b0503a', transform: 'rotate(45deg)' }} />
        <span>Corpus</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: 100, lineHeight: 1.02, letterSpacing: '-0.04em' }}>Corpus</div>
        <div style={{ fontSize: 46, color: '#b0503a' }}>Learn words from real life.</div>
      </div>
      <div
        style={{
          display: 'flex',
          width: '100%',
          borderTop: '2px solid #1c1a16',
          paddingTop: '22px',
          fontSize: 24,
        }}
      >
        Capture · Enrich · Practice
      </div>
    </div>,
    size,
  );
}
