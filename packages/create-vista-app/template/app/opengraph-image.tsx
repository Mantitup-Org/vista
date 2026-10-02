import { ImageResponse } from 'vista/og';

export const alt = 'My Vista App';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function loadFont(): Promise<ArrayBuffer> {
  const response = await fetch(
    'https://cdn.jsdelivr.net/fontsource/fonts/inter@5.0.16/latin-700-normal.ttf'
  );
  if (!response.ok) {
    throw new Error(`Failed to load font (${response.status})`);
  }
  return response.arrayBuffer();
}

export default async function OpenGraphImage() {
  const fontData = await loadFont();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#111111',
          color: '#fafafa',
          fontSize: 72,
          fontWeight: 700,
          fontFamily: 'Inter',
        }}
      >
        My Vista App
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Inter', data: fontData, weight: 700, style: 'normal' }],
    }
  );
}
