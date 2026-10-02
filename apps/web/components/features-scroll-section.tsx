'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { motion, useMotionValueEvent, useScroll } from 'framer-motion';
import {
  architectureCanvas,
  architectureEdges,
  architectureNodes,
  getArchitectureNode,
  runtimeSteps,
} from '@/data/architecture';
import { runtimeSection } from '@/data/home';
import type { ArchitectureEdge, ArchitectureNode, ArchitectureSide } from '@/types/architecture';

const VIEW_W = architectureCanvas.width;
const VIEW_H = architectureCanvas.height;

function anchor(node: ArchitectureNode, side: ArchitectureSide) {
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

function smoothStepPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius = 18,
  prefer: 'auto' | 'vertical' = 'auto',
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.abs(dy) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
  if (Math.abs(dx) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;

  const midX = x1 + dx / 2;
  const horizontalFirst = prefer === 'vertical' ? false : Math.abs(dx) >= Math.abs(dy);

  if (horizontalFirst) {
    const r = Math.min(radius, Math.abs(dx) / 2 - 1, Math.abs(dy) / 2 - 1);
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

  const midY = y1 + dy / 2;
  const r = Math.min(radius, Math.abs(dy) / 2 - 1, Math.abs(dx) / 2 - 1);
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

function edgePath(edge: ArchitectureEdge): string {
  const from = getArchitectureNode(edge.from);
  const to = getArchitectureNode(edge.to);
  const a = anchor(from, edge.fromSide);
  const b = anchor(to, edge.toSide);
  // Top center → straight up to the next block’s height → into its left edge
  if (edge.fromSide === 'top' && edge.toSide === 'left') {
    const r = 18;
    const sy = b.y < a.y ? -1 : 1;
    return [
      `M ${a.x} ${a.y}`,
      `L ${a.x} ${b.y - sy * r}`,
      `Q ${a.x} ${b.y} ${a.x + r} ${b.y}`,
      `L ${b.x} ${b.y}`,
    ].join(' ');
  }
  const prefer = edge.fromSide === 'top' ? 'vertical' : 'auto';
  return smoothStepPath(a.x, a.y, b.x, b.y, 20, prefer);
}

/* ─── Diagram ─── */

function ArchitectureStage({ step }: { step: number }) {
  const active = runtimeSteps[step] ?? runtimeSteps[0];
  const litNodes = useMemo(() => new Set(active.nodes), [active]);
  const litEdges = useMemo(() => new Set(active.edges), [active]);

  return (
    <div className="flex w-full max-w-[min(100%,920px)] flex-col overflow-hidden rounded-sm border border-foreground/12 bg-background">
      <div
        className="relative w-full [container-type:size]"
        style={{
          aspectRatio: `${VIEW_W} / ${VIEW_H}`,
          maxHeight: 'min(58dvh, 480px)',
          backgroundImage:
            'linear-gradient(color-mix(in srgb, var(--foreground) 6%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--foreground) 6%, transparent) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      >
        <svg
          className="absolute inset-0 h-full w-full overflow-visible text-foreground"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          fill="none"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="feat-arch-arrow"
              viewBox="0 0 12 12"
              refX="10"
              refY="6"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path
                d="M 1.5 1.5 L 10 6 L 1.5 10.5"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.85"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </marker>
          </defs>

          {architectureEdges.map((edge) => {
            const d = edgePath(edge);
            const on = litEdges.has(edge.id);
            return (
              <g key={edge.id}>
                <path
                  d={d}
                  stroke="currentColor"
                  strokeOpacity="0.08"
                  strokeWidth="1.6"
                  fill="none"
                />
                <motion.path
                  d={d}
                  stroke="currentColor"
                  strokeOpacity="0.82"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  markerEnd={on ? 'url(#feat-arch-arrow)' : undefined}
                  initial={false}
                  animate={{
                    pathLength: on ? 1 : 0,
                    opacity: on ? 1 : 0,
                  }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                />
              </g>
            );
          })}
        </svg>

        <div className="absolute inset-0">
          {architectureNodes.map((node) => {
            const on = litNodes.has(node.id);
            const isPanel = Boolean(node.lines?.length);
            return (
              <motion.div
                key={node.id}
                initial={false}
                animate={{
                  opacity: on ? 1 : 0.18,
                  scale: on ? 1 : 0.98,
                  borderColor: on
                    ? 'color-mix(in srgb, var(--foreground) 55%, transparent)'
                    : 'color-mix(in srgb, var(--foreground) 12%, transparent)',
                  backgroundColor: on
                    ? 'color-mix(in srgb, var(--background) 92%, var(--foreground))'
                    : 'color-mix(in srgb, var(--background) 72%, transparent)',
                  boxShadow: 'none',
                }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="absolute overflow-hidden rounded-[0.55em] border px-[0.8em] py-[0.55em]"
                style={{
                  left: `${(node.x / VIEW_W) * 100}%`,
                  top: `${(node.y / VIEW_H) * 100}%`,
                  width: `${(node.w / VIEW_W) * 100}%`,
                  height: `${(node.h / VIEW_H) * 100}%`,
                  fontSize: 'clamp(11px, 1.55cqw, 16px)',
                }}
              >
                <div
                  className={
                    isPanel
                      ? 'text-[0.7em] font-medium uppercase tracking-[0.14em] text-foreground/50'
                      : 'text-[1.05em] font-medium tracking-[-0.02em] text-foreground/90'
                  }
                >
                  {node.label}
                </div>
                {node.sub ? (
                  <div className="mt-[0.3em] font-mono text-[0.82em] text-foreground/40">{node.sub}</div>
                ) : null}
                {node.lines ? (
                  <ul className="mt-[0.45em] space-y-[0.25em]">
                    {node.lines.map((line) => (
                      <li key={line} className="font-mono text-[0.76em] leading-snug text-foreground/40">
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DockCaption({ show }: { show: boolean }) {
  return (
    <p className="mb-4 flex min-h-[1.4em] flex-wrap justify-center gap-x-[0.35em] text-[0.95rem] tracking-[-0.01em] text-foreground/55">
      {runtimeSection.dockCaption.map((word, i) => (
        <motion.span
          key={word}
          className="inline-block"
          initial={false}
          animate={
            show
              ? { opacity: 1, filter: 'blur(0px)', y: 0 }
              : { opacity: 0, filter: 'blur(14px)', y: 8 }
          }
          transition={{
            duration: 0.6,
            delay: show ? 0.12 + i * 0.09 : 0,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          {word}
        </motion.span>
      ))}
    </p>
  );
}

/* ─── Section ─── */

type FeaturesScrollSectionProps = {
  endRef?: RefObject<HTMLDivElement | null>;
};

export function FeaturesScrollSection({ endRef }: FeaturesScrollSectionProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [docked, setDocked] = useState(false);

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const next = Math.min(
      runtimeSteps.length - 1,
      Math.max(0, Math.floor(v * runtimeSteps.length))
    );
    setStep((prev) => (prev === next ? prev : next));
  });

  // Fires once the section pins — the copy bar has landed. Not tied to scroll progress.
  useEffect(() => {
    let frame = 0;
    const check = () => {
      const top = trackRef.current?.getBoundingClientRect().top ?? 1;
      const stuck = top <= 2;
      setDocked((prev) => (prev === stuck ? prev : stuck));
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <section className="relative bg-background text-foreground">
      <div
        ref={trackRef}
        className="relative"
        style={{ height: `${runtimeSteps.length * 100}vh` }}
      >
        <div className="sticky top-0 flex h-[100dvh] flex-col overflow-hidden">
          <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 items-stretch px-[clamp(1.5rem,4vw,3.5rem)] py-[clamp(4.5rem,8vh,5.5rem)]">
            <div className="flex w-full flex-col items-start gap-10 lg:flex-row lg:items-stretch lg:gap-14 xl:gap-16">
              <div className="flex h-full w-full shrink-0 flex-col lg:w-[min(36%,26rem)]">
                <div className="flex min-h-0 flex-[0.78] flex-col justify-end pb-6">
                  <p className="mb-4 text-[0.72rem] font-medium uppercase tracking-[0.22em] text-foreground/35">
                    {runtimeSection.kicker}
                  </p>
                  <h2 className="text-[clamp(2.1rem,4.2vw,3.35rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-foreground">
                    {runtimeSection.title}
                    <span className="mt-1.5 block text-foreground/45">{runtimeSection.titleMuted}</span>
                  </h2>
                </div>

                <div className="relative min-h-0 flex-1">
                  <div
                    className="absolute bottom-2 left-[0.6rem] top-2 w-px bg-foreground/10"
                    aria-hidden
                  />
                  <ol className="relative space-y-3">
                  {runtimeSteps.map((item, i) => {
                    const active = i === step;
                    const revealed = i <= step;
                    return (
                      <li key={item.title} className="relative pl-8">
                        <span
                          className={`absolute left-0 top-[0.65rem] h-3 w-3 rounded-full border transition-colors duration-300 ${
                            active
                              ? 'border-foreground bg-foreground'
                              : revealed
                                ? 'border-foreground/50 bg-foreground/40'
                                : 'border-foreground/25 bg-background'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const el = trackRef.current;
                            if (!el) return;
                            const rect = el.getBoundingClientRect();
                            const start = window.scrollY + rect.top;
                            const range = el.offsetHeight - window.innerHeight;
                            const target = start + (i / (runtimeSteps.length - 1)) * range;
                            window.scrollTo({ top: target, behavior: 'smooth' });
                          }}
                          className="w-full text-left"
                        >
                          <div
                            className={`flex items-baseline gap-3.5 transition-colors duration-300 ${
                              revealed ? 'text-foreground' : 'text-foreground/35'
                            }`}
                          >
                            <span className="font-mono text-[0.78rem] tracking-wider">
                              {String(i + 1).padStart(2, '0')}
                            </span>
                            <span
                              className={`text-[clamp(1.2rem,1.9vw,1.55rem)] font-medium tracking-[-0.02em] ${
                                active ? 'text-foreground' : ''
                              }`}
                            >
                              {item.title}
                            </span>
                          </div>
                          <div
                            className="grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                            style={{ gridTemplateRows: revealed ? '1fr' : '0fr' }}
                          >
                            <div className="overflow-hidden">
                              <p
                                className={`pt-2 text-[1rem] leading-relaxed text-foreground/55 transition-opacity duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                                  revealed ? 'opacity-100' : 'opacity-0'
                                }`}
                              >
                                {item.description}
                              </p>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                  </ol>
                </div>
              </div>

              <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center self-center">
                <DockCaption show={docked} />
                <div
                  ref={endRef}
                  className="mb-12 h-[28px] w-[min(92vw,16rem)]"
                  aria-hidden="true"
                />
                <ArchitectureStage step={step} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
