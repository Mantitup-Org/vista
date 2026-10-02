'use client';

import { useMemo, useRef, useState, type UIEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Play, RotateCcw } from 'lucide-react';
import { fullstackApisSection } from '@/data/fullstack-apis';
import { highlightOutput, highlightSource } from '@/lib/code-highlight';
import { runPageSource, runRouteSource, type FullstackApisRunResult } from '@/lib/fullstack-apis-runner';
import type { FullstackApisSide } from '@/types/fullstack-apis';

function resolveRouteFileId(side: FullstackApisSide, url: string): string | null {
  const path = url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '');
  const detail = /\/notes\/[^/]+$/.test(path);
  if (detail) {
    const nested = side.files.find(
      (file) => file.runKind === 'route' && (/\[id\]/.test(file.path) || /notes\/\[id\]/.test(file.path))
    );
    if (nested) return nested.id;
  }

  const collection = side.files.find((file) => {
    if (file.runKind !== 'route') return false;
    const normalized = file.path.replace(/\\/g, '/');
    return (
      normalized.endsWith('api/notes/route.ts') ||
      normalized.endsWith('routes/notes.ts') ||
      file.id === side.routeFileId
    );
  });
  return collection?.id ?? side.routeFileId ?? null;
}

function treeTone(line: { text: string; muted?: boolean; highlight?: boolean; fileId?: string }, selected: boolean) {
  if (selected) return 'bg-sky-500/15 text-sky-700 dark:text-sky-300';
  if (line.highlight) return 'text-emerald-700 dark:text-emerald-300';
  if (line.muted || line.text.trimEnd().endsWith('/')) return 'text-foreground/35';
  if (line.text.includes('.tsx')) return 'text-violet-700 dark:text-violet-300';
  if (line.text.includes('.ts')) return 'text-sky-700 dark:text-sky-300';
  if (line.text.includes('.json')) return 'text-amber-700 dark:text-amber-300';
  return 'text-foreground/75';
}

function Playground({
  side,
  tone,
}: {
  side: FullstackApisSide;
  tone: 'before' | 'after';
}) {
  const isAfter = tone === 'after';
  const [activeId, setActiveId] = useState(side.defaultFileId);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(side.files.map((file) => [file.id, file.source]))
  );
  const [method, setMethod] = useState<'GET' | 'POST'>('GET');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<FullstackApisRunResult | null>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const active = side.files.find((file) => file.id === activeId) ?? side.files[0];
  const source = drafts[active.id] ?? active.source;
  const canRun = active.runKind === 'route' || active.runKind === 'page';

  const openFile = (fileId: string) => {
    setActiveId(fileId);
    setResult(null);
    setMethod('GET');
  };

  const resetFile = () => {
    setDrafts((prev) => ({ ...prev, [active.id]: active.source }));
    setResult(null);
  };

  const run = async () => {
    if (!canRun) return;
    setRunning(true);
    try {
      if (active.runKind === 'route') {
        setResult(await runRouteSource(source, method));
      } else {
        setResult(
          await runPageSource(source, {
            sameOrigin: isAfter,
            resolveRouteSource: (url) => {
              const fileId = resolveRouteFileId(side, url);
              if (!fileId) return null;
              return drafts[fileId] ?? side.files.find((file) => file.id === fileId)?.source ?? null;
            },
          })
        );
      }
    } finally {
      setRunning(false);
    }
  };

  const outputKind = !result ? 'idle' : result.ok ? 'ok' : 'error';
  const outputText = useMemo(() => {
    if (!result) return '// Edit a file, then Run to see the response.';
    if (!result.ok) return `// ${result.meta ? result.meta + ' · ' : ''}error\n${result.error}`;
    return `// ${result.meta}\n${JSON.stringify(result.body, null, 2)}`;
  }, [result]);

  const codeHtml = useMemo(() => highlightSource(source, active.language), [source, active.language]);
  const outputHtml = useMemo(() => highlightOutput(outputText, outputKind), [outputText, outputKind]);

  const syncScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    const pre = highlightRef.current;
    if (!pre) return;
    pre.scrollTop = event.currentTarget.scrollTop;
    pre.scrollLeft = event.currentTarget.scrollLeft;
  };

  return (
    <div
      className={`cmp-scope flex min-h-[36rem] flex-col overflow-hidden border sm:min-h-[40rem] ${
        isAfter
          ? 'border-foreground/35 bg-foreground/[0.04] shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_8%,transparent)]'
          : 'border-foreground/18 bg-foreground/[0.02]'
      }`}
    >
      <style>{`
        .cmp-scope .cmp-kw { color: #7c3aed; }
        .cmp-scope .cmp-str { color: #b45309; }
        .cmp-scope .cmp-cmt { color: #6b7280; font-style: italic; }
        .cmp-scope .cmp-fn { color: #0369a1; }
        .cmp-scope .cmp-type { color: #0f766e; }
        .cmp-scope .cmp-num { color: #c2410c; }
        .cmp-scope .cmp-tag { color: #be185d; }
        .cmp-scope .cmp-key { color: #1d4ed8; }
        .cmp-scope .cmp-punc { color: #6b7280; }
        .cmp-scope .cmp-meta { color: #059669; }
        .cmp-scope .cmp-err { color: #dc2626; font-weight: 600; }
        .cmp-scope .cmp-err-dim { color: #f87171; }
        .dark .cmp-scope .cmp-kw { color: #c4b5fd; }
        .dark .cmp-scope .cmp-str { color: #fbbf24; }
        .dark .cmp-scope .cmp-cmt { color: #6b7280; }
        .dark .cmp-scope .cmp-fn { color: #7dd3fc; }
        .dark .cmp-scope .cmp-type { color: #5eead4; }
        .dark .cmp-scope .cmp-num { color: #fdba74; }
        .dark .cmp-scope .cmp-tag { color: #f9a8d4; }
        .dark .cmp-scope .cmp-key { color: #93c5fd; }
        .dark .cmp-scope .cmp-punc { color: #9ca3af; }
        .dark .cmp-scope .cmp-meta { color: #6ee7b7; }
        .dark .cmp-scope .cmp-err { color: #f87171; }
        .dark .cmp-scope .cmp-err-dim { color: #fca5a5; }
      `}</style>

      <div className="border-b border-foreground/12 px-5 py-4 sm:px-6">
        <h3 className="text-[1.35rem] font-semibold tracking-[-0.03em] text-foreground sm:text-[1.5rem]">
          {side.label}
        </h3>
        <p className="mt-1.5 max-w-xl text-[0.95rem] leading-snug text-foreground/60">{side.caption}</p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(13rem,18rem)_minmax(0,1fr)]">
        <aside className="border-b border-foreground/12 bg-foreground/[0.015] lg:border-b-0 lg:border-r">
          <p className="border-b border-foreground/10 px-4 py-3 text-[0.62rem] font-medium uppercase tracking-[0.18em] text-foreground/40">
            File structure
          </p>
          <ul className="max-h-[14rem] space-y-0.5 overflow-y-auto px-3 py-3 font-mono text-[0.8rem] leading-[1.75] sm:text-[0.84rem] lg:max-h-none">
            {side.tree.map((line) => {
              const clickable = Boolean(line.fileId);
              const selected = line.fileId === activeId;
              const className = treeTone(line, selected);
              return (
                <li key={`${line.text}-${line.fileId ?? 'dir'}`}>
                  {clickable ? (
                    <button
                      type="button"
                      onClick={() => openFile(line.fileId!)}
                      className={`block w-full rounded-sm px-1.5 text-left transition-colors hover:bg-foreground/8 ${className}`}
                    >
                      <span className="whitespace-pre">{line.text}</span>
                    </button>
                  ) : (
                    <span className={`block px-1.5 whitespace-pre ${className}`}>{line.text}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-foreground/12 px-3 py-2">
            <p className="min-w-0 flex-1 truncate px-1 font-mono text-[0.78rem] text-sky-700 dark:text-sky-300">
              {active.path}
            </p>
            {active.runKind === 'route' ? (
              <div className="inline-flex overflow-hidden border border-foreground/15">
                {(['GET', 'POST'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMethod(value)}
                    className={`px-2.5 py-1 font-mono text-[0.68rem] tracking-wide transition-colors ${
                      method === value
                        ? 'bg-foreground text-background'
                        : 'text-foreground/55 hover:text-foreground'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              onClick={resetFile}
              className="inline-flex items-center gap-1.5 border border-foreground/15 px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-foreground/60 transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <RotateCcw size={12} />
              Reset
            </button>
            <button
              type="button"
              onClick={run}
              disabled={!canRun || running}
              className={`inline-flex items-center gap-1.5 border px-3 py-1 font-mono text-[0.68rem] uppercase tracking-[0.12em] transition-colors ${
                canRun
                  ? 'border-foreground bg-foreground text-background hover:bg-foreground/90'
                  : 'cursor-not-allowed border-foreground/10 text-foreground/30'
              }`}
            >
              <Play size={12} fill="currentColor" />
              {running ? 'Running' : 'Run'}
            </button>
          </div>

          <div className="relative min-h-[14rem] flex-[1.15] sm:min-h-[16rem]">
            <pre
              ref={highlightRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre px-4 py-4 font-mono text-[0.84rem] leading-[1.7] sm:text-[0.9rem]"
            >
              <code dangerouslySetInnerHTML={{ __html: codeHtml }} />
            </pre>
            <textarea
              ref={textareaRef}
              value={source}
              onChange={(event) => {
                const next = event.target.value;
                setDrafts((prev) => ({ ...prev, [active.id]: next }));
              }}
              onScroll={syncScroll}
              spellCheck={false}
              className="absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent px-4 py-4 font-mono text-[0.84rem] leading-[1.7] text-transparent caret-foreground outline-none sm:text-[0.9rem]"
              aria-label={`Edit ${active.path}`}
            />
          </div>

          <div
            className={`border-t ${
              outputKind === 'error'
                ? 'border-red-500/30 bg-red-500/[0.06]'
                : outputKind === 'ok'
                  ? 'border-emerald-500/25 bg-emerald-500/[0.05]'
                  : 'border-foreground/12 bg-foreground/[0.03]'
            }`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-foreground/10 px-4 py-2">
              <p className="text-[0.62rem] font-medium uppercase tracking-[0.18em] text-foreground/45">
                Response
              </p>
              <p
                className={`font-mono text-[0.68rem] font-semibold tracking-wide ${
                  outputKind === 'error'
                    ? 'text-red-600 dark:text-red-400'
                    : outputKind === 'ok'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-foreground/35'
                }`}
              >
                {result ? (result.ok ? `${result.status} OK` : 'failed') : 'idle'}
              </p>
            </div>
            <pre
              className="max-h-[12rem] overflow-auto px-4 py-3 font-mono text-[0.8rem] leading-[1.65] sm:text-[0.84rem]"
              dangerouslySetInnerHTML={{ __html: outputHtml }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function FullstackApisSection() {
  const reduceMotion = useReducedMotion();
  const { title, titleMuted, body, before, after } = fullstackApisSection;

  return (
    <section className="relative bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1440px] px-[clamp(1.5rem,4vw,3.5rem)] py-[clamp(5.5rem,12vh,9rem)]">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="mb-12 max-w-3xl lg:mb-14"
        >
          <h2 className="text-[clamp(2.25rem,4.5vw,3.6rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-foreground">
            {title}
            <span className="mt-1.5 block text-foreground/45">{titleMuted}</span>
          </h2>
          <p className="mt-6 text-[1.1rem] leading-relaxed text-foreground/65">{body}</p>
        </motion.div>

        <div className="flex flex-col gap-8 xl:gap-10">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.7, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-3"
          >
            <p className="text-[1.05rem] font-bold tracking-[-0.02em] text-foreground sm:text-[1.15rem]">
              Before
            </p>
            <Playground side={before} tone="before" />
          </motion.div>

          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-3"
          >
            <p className="text-[1.05rem] font-bold tracking-[-0.02em] text-foreground sm:text-[1.15rem]">
              After
            </p>
            <Playground side={after} tone="after" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
