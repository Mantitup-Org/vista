'use client';

import { Revealed } from 'revealed/react';

/** Soft dissolve so the broken base mixes into the hero bg */
const BASE_FADE =
  'linear-gradient(to bottom, #000 0%, #000 78%, rgba(0,0,0,0.7) 90%, rgba(0,0,0,0.2) 96%, transparent 100%)';

/**
 * Marble bust that tears open along a wet liquid edge to the chrome layer —
 * same character as landonorris.com (WebGL fluid reveal, not a spotlight).
 *
 * @see https://landonorris.com/
 * @see https://revealed.idlee.xyz
 */
export function HeroBustReveal() {
  return (
    <div
      className="absolute left-1/2 top-[48%] z-[5] aspect-[3/4] h-[min(90dvh,80vmin)] max-w-[min(48vw,720px)] w-auto -translate-x-1/2 -translate-y-1/2 cursor-crosshair touch-none"
      style={{
        WebkitMaskImage: BASE_FADE,
        maskImage: BASE_FADE,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: '100% 100%',
        maskSize: '100% 100%',
      }}
      aria-hidden="true"
    >
      <Revealed
        front="/greek-bust.png?v=7"
        back="/greek-bust-skeleton.png?v=7"
        aspect={3 / 4}
        edge="liquid"
        brush={{
          radius: 0.2,
          trail: 2.8,
          wave: true,
        }}
        idle={{
          enabled: true,
          strokes: 1,
          speed: 0.85,
          yieldAfter: 1600,
        }}
        className="h-full w-full"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
