'use client';

import { StructureFlowCollection } from '@designcodeio/threeui/components/StructureFlowCollection';
import '@designcodeio/threeui/style.css';

/**
 * Hero background — ThreeUI Structure Flow “Dot Matrix”
 * Exact package renderer (@designcodeio/threeui), variant dot-matrix.
 */
export function HeroDotMatrix() {
  return (
    <div className="shader-frame absolute inset-0 z-0 h-full w-full" aria-hidden="true">
      <StructureFlowCollection
        variant="dot-matrix"
        speed={1.0}
        gridScale={60}
        mouseAmount={0.04}
        pulseSpeed={0.4}
        hue={0}
        radius={0.15}
        opacity={0.35}
      />
    </div>
  );
}
