'use client';

import { motion } from 'framer-motion';

type NodeDef = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub?: string;
  lines?: string[];
};

/** Staggered layout — orthogonal elbows with rounded corners */
const NODES: NodeDef[] = [
  { id: 'pages', x: 16, y: 56, w: 200, h: 108, label: 'Pages', sub: 'app/' },
  { id: 'apis', x: 292, y: 16, w: 200, h: 108, label: 'APIs', sub: 'route.ts' },
  { id: 'auth', x: 568, y: 64, w: 200, h: 108, label: 'Auth', sub: 'sessions' },
  { id: 'agents', x: 844, y: 24, w: 200, h: 108, label: 'Agents', sub: 'stream' },
  {
    id: 'typed',
    x: 276,
    y: 280,
    w: 232,
    h: 160,
    label: 'Typed procedures',
    lines: ['createCaller', 'rsc → api', 'same app/'],
  },
  {
    id: 'runtime',
    x: 552,
    y: 300,
    w: 232,
    h: 160,
    label: 'Runtime',
    lines: ['SSR / RSC', 'middleware', 'one process'],
  },
  {
    id: 'ai',
    x: 828,
    y: 268,
    w: 232,
    h: 160,
    label: 'AI layer',
    lines: ['vista/ai', 'tools + RAG', 'g agent'],
  },
];

const VIEW_W = 1080;
const VIEW_H = 490;

type EdgeDef = {
  id: string;
  from: string;
  to: string;
  fromSide: 'right' | 'bottom';
  toSide: 'left' | 'top';
  delay: number;
};

const EDGES: EdgeDef[] = [
  { id: 'e1', from: 'pages', to: 'apis', fromSide: 'right', toSide: 'left', delay: 0.1 },
  { id: 'e2', from: 'apis', to: 'auth', fromSide: 'right', toSide: 'left', delay: 0.22 },
  { id: 'e3', from: 'auth', to: 'agents', fromSide: 'right', toSide: 'left', delay: 0.34 },
  { id: 'e4', from: 'apis', to: 'typed', fromSide: 'bottom', toSide: 'top', delay: 0.48 },
  { id: 'e5', from: 'auth', to: 'runtime', fromSide: 'bottom', toSide: 'top', delay: 0.6 },
  { id: 'e6', from: 'agents', to: 'ai', fromSide: 'bottom', toSide: 'top', delay: 0.72 },
  { id: 'e7', from: 'typed', to: 'runtime', fromSide: 'right', toSide: 'left', delay: 0.86 },
  { id: 'e8', from: 'runtime', to: 'ai', fromSide: 'right', toSide: 'left', delay: 0.98 },
];

function nodeById(id: string): NodeDef {
  const node = NODES.find((n) => n.id === id);
  if (!node) throw new Error(`Missing node ${id}`);
  return node;
}

function anchor(node: NodeDef, side: 'left' | 'right' | 'top' | 'bottom') {
  switch (side) {
    case 'left':
      return { x: node.x, y: node.y + node.h / 2 };
    case 'right':
      return { x: node.x + node.w, y: node.y + node.h / 2 };
    case 'top':
      return { x: node.x + node.w / 2, y: node.y };
    case 'bottom':
      return { x: node.x + node.w / 2, y: node.y + node.h };
  }
}

/** Orthogonal H/V route with filleted 90° corners. */
function smoothStepPath(x1: number, y1: number, x2: number, y2: number, radius = 18): string {
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (Math.abs(dy) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
  if (Math.abs(dx) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;

  const midX = x1 + dx / 2;
  const midY = y1 + dy / 2;
  const horizontalFirst = Math.abs(dx) >= Math.abs(dy);

  if (horizontalFirst) {
    const r = Math.min(
      radius,
      Math.abs(dx) / 2 - 1,
      Math.abs(dy) / 2 - 1,
      Math.abs(midX - x1),
      Math.abs(x2 - midX),
    );
    if (r < 2) return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
    const sy = dy >= 0 ? 1 : -1;
    const sx1 = midX >= x1 ? 1 : -1;
    const sx2 = x2 >= midX ? 1 : -1;
    return [
      `M ${x1} ${y1}`,
      `L ${midX - sx1 * r} ${y1}`,
      `Q ${midX} ${y1} ${midX} ${y1 + sy * r}`,
      `L ${midX} ${y2 - sy * r}`,
      `Q ${midX} ${y2} ${midX + sx2 * r} ${y2}`,
      `L ${x2} ${y2}`,
    ].join(' ');
  }

  const r = Math.min(
    radius,
    Math.abs(dy) / 2 - 1,
    Math.abs(dx) / 2 - 1,
    Math.abs(midY - y1),
    Math.abs(y2 - midY),
  );
  if (r < 2) return `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
  const sx = dx >= 0 ? 1 : -1;
  const sy1 = midY >= y1 ? 1 : -1;
  const sy2 = y2 >= midY ? 1 : -1;
  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${midY - sy1 * r}`,
    `Q ${x1} ${midY} ${x1 + sx * r} ${midY}`,
    `L ${x2 - sx * r} ${midY}`,
    `Q ${x2} ${midY} ${x2} ${midY + sy2 * r}`,
    `L ${x2} ${y2}`,
  ].join(' ');
}

function edgePath(edge: EdgeDef): string {
  const from = nodeById(edge.from);
  const to = nodeById(edge.to);
  const a = anchor(from, edge.fromSide);
  const b = anchor(to, edge.toSide);
  return smoothStepPath(a.x, a.y, b.x, b.y, 20);
}

function ArchCard({
  node,
  index,
}: {
  node: NodeDef & { left: string; top: string; width: string; height: string };
  index: number;
}) {
  const isPanel = Boolean(node.lines?.length);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24, delay: index * 0.06 }}
      whileHover={{
        scale: 1.035,
        y: -3,
        borderColor: 'rgba(255,255,255,0.85)',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.35), 0 20px 44px rgba(0,0,0,0.55)',
      }}
      className="absolute overflow-hidden rounded-[0.65em] border border-white/40 bg-black/75 px-[0.85em] py-[0.65em] backdrop-blur-[2px]"
      style={{
        left: node.left,
        top: node.top,
        width: node.width,
        height: node.height,
        fontSize: 'clamp(10px, 1.55cqw, 16px)',
      }}
    >
      <div
        className={
          isPanel
            ? 'text-[0.72em] font-medium uppercase tracking-[0.16em] text-white/55'
            : 'text-[1.05em] font-medium tracking-[-0.02em] text-white/95'
        }
      >
        {node.label}
      </div>
      {node.sub ? (
        <div className="mt-[0.35em] font-mono text-[0.82em] text-white/45">{node.sub}</div>
      ) : null}
      {node.lines ? (
        <ul className="mt-[0.5em] space-y-[0.28em]">
          {node.lines.map((line) => (
            <li key={line} className="font-mono text-[0.78em] leading-snug text-white/45">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </motion.div>
  );
}

function Edge({ edge }: { edge: EdgeDef }) {
  const d = edgePath(edge);

  return (
    <g>
      <path
        d={d}
        stroke="rgba(255,255,255,0.16)"
        strokeWidth="2"
        fill="none"
        markerEnd="url(#arch-arrow-dim)"
      />
      <motion.path
        d={d}
        stroke="rgba(255,255,255,0.78)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        markerEnd="url(#arch-arrow)"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: 'easeInOut', delay: edge.delay }}
      />
      <motion.path
        d={d}
        stroke="rgba(255,255,255,0.95)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray="7 11"
        initial={{ strokeDashoffset: 0 }}
        animate={{ strokeDashoffset: -72 }}
        transition={{
          duration: 2.2,
          ease: 'linear',
          repeat: Infinity,
          delay: edge.delay + 0.75,
        }}
      />
    </g>
  );
}

export function HeroArchitecture() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-[1] hidden md:block"
      style={{
        left: '46%',
        right: 'clamp(0.75rem, 2vw, 1.75rem)',
        top: 'clamp(11%, 13vh, 17%)',
      }}
    >
      <div
        className="pointer-events-auto w-full"
        style={{
          WebkitMaskImage:
            'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.2) 6%, rgba(0,0,0,0.7) 16%, #000 28%)',
          maskImage:
            'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.2) 6%, rgba(0,0,0,0.7) 16%, #000 28%)',
        }}
      >
        <div
          className="relative w-full opacity-[0.94] [container-type:size]"
          style={{
            aspectRatio: `${VIEW_W} / ${VIEW_H}`,
            maxHeight: 'min(52dvh, 64vmin)',
            width: 'min(100%, calc(min(52dvh, 64vmin) * 1080 / 490))',
          }}
        >
          <svg
            className="absolute inset-0 h-full w-full overflow-visible"
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="arch-arrow"
                viewBox="0 0 12 12"
                refX="10"
                refY="6"
                markerWidth="9"
                markerHeight="9"
                orient="auto-start-reverse"
              >
                <path
                  d="M 1.5 1.5 L 10 6 L 1.5 10.5"
                  fill="none"
                  stroke="rgba(255,255,255,0.8)"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </marker>
              <marker
                id="arch-arrow-dim"
                viewBox="0 0 12 12"
                refX="10"
                refY="6"
                markerWidth="9"
                markerHeight="9"
                orient="auto-start-reverse"
              >
                <path
                  d="M 1.5 1.5 L 10 6 L 1.5 10.5"
                  fill="none"
                  stroke="rgba(255,255,255,0.28)"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </marker>
            </defs>

            {EDGES.map((edge) => (
              <Edge key={edge.id} edge={edge} />
            ))}
          </svg>

          <div className="absolute inset-0">
            {NODES.map((node, index) => (
              <ArchCard
                key={node.id}
                index={index}
                node={{
                  ...node,
                  left: `${(node.x / VIEW_W) * 100}%`,
                  top: `${(node.y / VIEW_H) * 100}%`,
                  width: `${(node.w / VIEW_W) * 100}%`,
                  height: `${(node.h / VIEW_H) * 100}%`,
                }}
              />
            ))}
          </div>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.35 }}
          className="mt-[0.6em] text-right text-[clamp(0.62rem,0.9vw,0.75rem)] uppercase tracking-[0.22em] text-white/35"
        >
          one project · no second server
        </motion.p>
      </div>
    </div>
  );
}
