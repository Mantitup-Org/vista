'use client';

import { useMemo, useRef, useState, type UIEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Play, RotateCcw } from 'lucide-react';
import { agentsSection } from '@/data/agents';
import { highlightOutput, highlightSource } from '@/lib/code-highlight';
import { runAgentPlayground, type AgentsRunResult } from '@/lib/agents-runner';
import type { AgentsSnippet } from '@/types/agents';

type PaneId = 'agent' | 'route' | 'client';

function EditablePane({
  snippet,
  source,
  onChange,
  showHeader = true,
}: {
  snippet: AgentsSnippet;
  source: string;
  onChange: (next: string) => void;
  showHeader?: boolean;
}) {
  const highlightRef = useRef<HTMLPreElement>(null);
  const html = useMemo(
    () => highlightSource(source, snippet.language),
    [source, snippet.language]
  );

  const syncScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    const pre = highlightRef.current;
    if (!pre) return;
    pre.scrollTop = event.currentTarget.scrollTop;
    pre.scrollLeft = event.currentTarget.scrollLeft;
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {showHeader ? (
        <div className="flex items-center justify-between gap-3 border-b border-foreground/12 px-4 py-2.5">
          <p className="truncate font-mono text-[0.78rem] text-foreground/55">{snippet.path}</p>
          <span className="shrink-0 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-foreground/40">
            {snippet.caption}
          </span>
        </div>
      ) : null}
      <div className="relative min-h-[16rem] flex-1 sm:min-h-[18rem]">
        <pre
          ref={highlightRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre px-4 py-4 font-mono text-[0.84rem] leading-[1.7] sm:text-[0.9rem]"
        >
          <code dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
        <textarea
          value={source}
          onChange={(event) => onChange(event.target.value)}
          onScroll={syncScroll}
          spellCheck={false}
          className="absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent px-4 py-4 font-mono text-[0.84rem] leading-[1.7] text-transparent caret-foreground outline-none sm:text-[0.9rem]"
          aria-label={`Edit ${snippet.path}`}
        />
      </div>
    </div>
  );
}

export function AgentsSection() {
  const reduceMotion = useReducedMotion();
  const { title, titleMuted, body, connector, agent, route, client } = agentsSection;
  const [rightTab, setRightTab] = useState<'route' | 'client'>('route');
  const [drafts, setDrafts] = useState<Record<PaneId, string>>({
    agent: agent.source,
    route: route.source,
    client: client.source,
  });
  const [prompt, setPrompt] = useState('How do I add an agent to my Vista app?');
  const [running, setRunning] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [result, setResult] = useState<AgentsRunResult | null>(null);

  const rightSnippet = rightTab === 'route' ? route : client;
  const rightSource = drafts[rightTab];

  const resetActive = () => {
    if (rightTab === 'route') {
      setDrafts((prev) => ({ ...prev, route: route.source }));
    } else {
      setDrafts((prev) => ({ ...prev, client: client.source }));
    }
    setResult(null);
    setStreamText('');
  };

  const resetAll = () => {
    setDrafts({
      agent: agent.source,
      route: route.source,
      client: client.source,
    });
    setPrompt('How do I add an agent to my Vista app?');
    setResult(null);
    setStreamText('');
  };

  const run = async () => {
    setRunning(true);
    setResult(null);
    setStreamText('');
    try {
      const next = await runAgentPlayground({
        agentSource: drafts.agent,
        routeSource: drafts.route,
        prompt,
        onChunk: setStreamText,
      });
      setResult(next);
      if (next.ok) setStreamText(next.text);
    } finally {
      setRunning(false);
    }
  };

  const outputKind = !result && !streamText ? 'idle' : result && !result.ok ? 'error' : 'ok';
  const outputText = useMemo(() => {
    if (running && streamText) return `// streaming…\n${streamText}`;
    if (!result && !streamText) return '// Edit the agent or route, enter a prompt, then Run.';
    if (result && !result.ok) return `// ${result.meta ? result.meta + ' · ' : ''}error\n${result.error}`;
    if (result && result.ok) return `// ${result.meta}\n${result.text}`;
    return streamText;
  }, [result, streamText, running]);

  const outputHtml = useMemo(() => highlightOutput(outputText, outputKind), [outputText, outputKind]);

  return (
    <section className="relative bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1440px] px-[clamp(1.5rem,4vw,3.5rem)] py-[clamp(5.5rem,12vh,9rem)]">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.45 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mb-12 max-w-2xl text-center lg:mb-14"
        >
          <h2 className="text-[clamp(2.25rem,4.5vw,3.6rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-foreground">
            {title}
            <span className="mt-1.5 block text-foreground/45">{titleMuted}</span>
          </h2>
          <p className="mt-6 text-[1.05rem] leading-relaxed text-foreground/65 sm:text-[1.1rem]">{body}</p>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.7, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
          className="cmp-scope flex min-h-[40rem] flex-col overflow-hidden border border-foreground/18 bg-foreground/[0.02] sm:min-h-[44rem]"
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

          <div className="flex flex-wrap items-center gap-2 border-b border-foreground/12 px-3 py-2.5 sm:px-4">
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void run();
                }
              }}
              placeholder="Prompt the agent…"
              className="min-w-0 flex-1 border border-foreground/15 bg-background px-3 py-1.5 font-mono text-[0.8rem] text-foreground outline-none placeholder:text-foreground/35 focus:border-foreground/35"
              aria-label="Agent prompt"
            />
            <button
              type="button"
              onClick={resetActive}
              className="inline-flex items-center gap-1.5 border border-foreground/15 px-2.5 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-foreground/60 transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <RotateCcw size={12} />
              Reset
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="hidden border border-foreground/15 px-2.5 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-foreground/50 transition-colors hover:text-foreground sm:inline-flex"
            >
              Reset all
            </button>
            <button
              type="button"
              onClick={run}
              disabled={running}
              className="inline-flex items-center gap-1.5 border border-foreground bg-foreground px-3 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-background transition-colors hover:bg-foreground/90 disabled:cursor-wait disabled:opacity-70"
            >
              <Play size={12} fill="currentColor" />
              {running ? 'Streaming' : 'Run'}
            </button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <EditablePane
              snippet={agent}
              source={drafts.agent}
              onChange={(next) => setDrafts((prev) => ({ ...prev, agent: next }))}
            />

            <div className="relative flex items-center justify-center border-y border-foreground/12 px-3 py-3 lg:border-x lg:border-y-0 lg:px-2">
              <span className="whitespace-nowrap font-mono text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-foreground/50">
                {connector}
              </span>
            </div>

            <div className="flex min-h-0 min-w-0 flex-col">
              <div className="flex items-center gap-1 border-b border-foreground/12 px-3 py-2">
                {(
                  [
                    { id: 'route' as const, label: 'route.ts' },
                    { id: 'client' as const, label: 'page.tsx' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setRightTab(tab.id)}
                    className={`min-w-0 truncate px-2.5 py-1 font-mono text-[0.72rem] transition-colors ${
                      rightTab === tab.id
                        ? 'bg-foreground text-background'
                        : 'text-foreground/50 hover:text-foreground'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <EditablePane
                snippet={rightSnippet}
                source={rightSource}
                onChange={(next) => setDrafts((prev) => ({ ...prev, [rightTab]: next }))}
                showHeader={false}
              />
            </div>
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
                Stream
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
                {running
                  ? 'streaming'
                  : result
                    ? result.ok
                      ? result.mode === 'live'
                        ? `live · ${result.model}`
                        : `demo · ${result.model}`
                      : 'failed'
                    : 'idle'}
              </p>
            </div>
            <pre
              className="max-h-[14rem] overflow-auto px-4 py-3 font-mono text-[0.8rem] leading-[1.65] sm:text-[0.84rem]"
              dangerouslySetInnerHTML={{ __html: outputHtml }}
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
