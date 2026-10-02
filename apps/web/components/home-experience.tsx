'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import {
  motion,
  useMotionTemplate,
  useScroll,
  useTransform,
} from 'framer-motion';
import { Check, Copy } from 'lucide-react';
import { HeroBustReveal } from './hero-bust-reveal';
import { FeaturesScrollSection } from './features-scroll-section';
import { FullstackApisSection } from './fullstack-apis-section';
import { AuthSection } from './auth-section';
import { AgentsSection } from './agents-section';
import { ClosingNoteSection } from './closing-note-section';
import { heroContent } from '@/data/home';
import { CREATE_VISTA_APP_COMMAND } from '@/data/site';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function smoothstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function CopyPill() {
  const [copied, setCopied] = useState(false);
  const command = CREATE_VISTA_APP_COMMAND;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="group pointer-events-auto inline-flex max-w-full cursor-pointer items-center gap-2 rounded-full border border-foreground/15 bg-foreground/[0.06] px-3 py-1 text-left transition-[border-color,background-color] hover:border-foreground/30 hover:bg-foreground/[0.1]"
      aria-label={copied ? 'Copied create command' : 'Copy create command'}
    >
      <span className="truncate font-mono text-[clamp(0.68rem,1vw,0.8rem)] leading-none tracking-tight text-foreground/75 group-hover:text-foreground/90">
        {command}
      </span>
      <span className="relative h-3 w-3 shrink-0">
        <Copy
          size={12}
          className={`absolute inset-0 text-foreground/45 transition-all duration-300 group-hover:text-foreground/80 ${
            copied ? 'scale-50 opacity-0' : 'scale-100 opacity-100'
          }`}
        />
        <Check
          size={12}
          className={`absolute inset-0 text-foreground transition-all duration-300 ${
            copied ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          }`}
        />
      </span>
    </button>
  );
}

type FlightOrigin = {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  travel: number;
};

/**
 * Hero + unnamed next section. The copy command docks in the hero, then
 * scroll-floats to the next section’s top center while growing slightly.
 */
export function HomeExperience() {
  const heroRef = useRef<HTMLElement>(null);
  const startRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState<FlightOrigin | null>(null);

  const { scrollY } = useScroll();

  const measure = () => {
    const start = startRef.current?.getBoundingClientRect();
    const end = endRef.current?.getBoundingClientRect();
    const hero = heroRef.current;
    if (!start || !end || !hero) return;

    const y = window.scrollY || window.pageYOffset;
    setOrigin({
      sx: start.left + start.width / 2,
      sy: start.top + start.height / 2 + y,
      ex: end.left + end.width / 2,
      ey: end.top + end.height / 2 + y,
      travel: Math.max(hero.offsetHeight, 1),
    });
  };

  useLayoutEffect(() => {
    measure();
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    const t = window.setTimeout(measure, 400);
    return () => {
      window.removeEventListener('resize', onResize);
      window.clearTimeout(t);
    };
  }, []);

  const progress = useTransform(scrollY, (latest) => {
    if (!origin) return 0;
    return smoothstep(latest / origin.travel);
  });

  // Read the live dock each frame so the pill tracks the sticky pad without setState jitter
  const x = useTransform([progress, scrollY], ([p]) => {
    const end = endRef.current?.getBoundingClientRect();
    if (!origin || !end) return origin?.sx ?? 0;
    const ex = end.left + end.width / 2;
    return origin.sx + (ex - origin.sx) * (p as number);
  });

  const y = useTransform([progress, scrollY], ([p, latest]) => {
    const end = endRef.current?.getBoundingClientRect();
    if (!origin || !end) return 0;
    const startViewport = origin.sy - (latest as number);
    const endViewport = end.top + end.height / 2;
    return startViewport + (endViewport - startViewport) * (p as number);
  });

  const scale = useTransform(progress, (p) => 1 + 0.22 * p);

  const transform = useMotionTemplate`translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scale})`;

  return (
    <>
      <section
        ref={heroRef}
        className="relative h-[calc(100dvh-4rem)] min-h-[576px] overflow-hidden bg-background text-foreground"
      >
        <HeroBustReveal />

        <div className="absolute left-[clamp(1rem,3.2vw,4.5rem)] top-[42%] z-10 flex max-w-[min(42vw,34rem)] -translate-y-1/2 flex-col items-start">
          <h1 className="pointer-events-none text-[clamp(2.1rem,5.4vw,5.25rem)] font-semibold leading-[0.95] tracking-[-0.04em]">
            {heroContent.lines.map((line) => (
              <span key={line.text} className={`block ${line.muted ? 'text-foreground/55' : 'text-foreground'}`}>
                {line.text}
              </span>
            ))}
          </h1>
          {/* Dock — reserves hero space; real pill is fixed and flights on scroll */}
          <div
            ref={startRef}
            className="mt-[clamp(0.85rem,2vh,1.35rem)] h-[28px] w-[min(90vw,15rem)]"
            aria-hidden="true"
          />
        </div>

        <div
          className="pointer-events-none absolute z-10 flex flex-col gap-1.5 font-normal leading-snug tracking-[-0.015em] text-foreground/70"
          style={{
            bottom: 'clamp(1.5rem, 5.5vh, 3rem)',
            left: 'calc(50% + min(14vw, 220px) + clamp(0.5rem, 1vw, 1rem))',
            right: 'clamp(1.25rem, 3vw, 2.5rem)',
            fontSize: 'clamp(1rem, 1.65vw, 1.35rem)',
            maxWidth: '20rem',
          }}
        >
          {heroContent.aside.map((line) => (
            <p key={line.text} className={line.indentClass}>
              {line.text}
            </p>
          ))}
        </div>
      </section>

      {/* Features — scroll-locked until architecture assembles */}
      <FeaturesScrollSection endRef={endRef} />

      {/* Fullstack APIs — interactive before/after playground */}
      <FullstackApisSection />

      {/* Auth — fail-closed middleware playground */}
      <AuthSection />

      {/* Agents — centered header + dual-pane code */}
      <AgentsSection />

      <ClosingNoteSection />

      {origin ? (
        <motion.div
          className="pointer-events-none fixed left-0 top-0 z-40 will-change-transform"
          style={{ transform, transformOrigin: 'center center' }}
          initial={{ opacity: 0, filter: 'blur(16px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{
            type: 'spring',
            stiffness: 120,
            damping: 18,
            mass: 0.9,
            delay: 0.35,
          }}
        >
          <div className="pointer-events-auto">
            <CopyPill />
          </div>
        </motion.div>
      ) : null}
    </>
  );
}
