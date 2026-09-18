'use client';

import { useCallback, useRef, useState } from 'react';

type ChatEvent =
  | { kind: 'user'; content: string }
  | { kind: 'tool-call'; name: string; args: unknown }
  | { kind: 'tool-result'; name: string; result: unknown }
  | { kind: 'assistant'; content: string };

type StreamChunk = {
  type: string;
  textDelta?: string;
  toolCall?: { name: string; arguments?: unknown };
  toolResult?: { name: string; result?: unknown };
  error?: string;
};

const SUGGESTIONS = [
  'How do API routes work in Vista?',
  'Explain the RAG feature',
  'What does middleware look like?',
  'Which platforms can vista deploy to?',
  'What is the refund policy?',
];

export function RagChatBox() {
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
  };

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  }, []);

  const send = useCallback(async (promptToSend: string) => {
    const prompt = promptToSend.trim();
    if (!prompt) return;

    setEvents((prev) => [...prev, { kind: 'user', content: prompt }]);
    setInput('');
    setIsLoading(true);
    setError(null);
    scrollToBottom();

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const response = await fetch('/api/rag-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, sessionId: 'ui-playground' }),
        signal: abort.signal,
      });

      if (!response.ok) {
        throw new Error((await response.text()) || `HTTP ${response.status}`);
      }
      if (!response.body) throw new Error('Empty response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';
      let assistantStarted = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') continue;

          let chunk: StreamChunk;
          try {
            chunk = JSON.parse(payload);
          } catch {
            continue;
          }

          if (chunk.type === 'tool-call' && chunk.toolCall) {
            setEvents((prev) => [
              ...prev,
              {
                kind: 'tool-call',
                name: chunk.toolCall!.name,
                args: chunk.toolCall!.arguments,
              },
            ]);
            scrollToBottom();
          } else if (chunk.type === 'tool-result' && chunk.toolResult) {
            setEvents((prev) => [
              ...prev,
              {
                kind: 'tool-result',
                name: chunk.toolResult!.name,
                result: chunk.toolResult!.result,
              },
            ]);
            scrollToBottom();
          } else if (chunk.type === 'text-delta' && chunk.textDelta) {
            assistantText += chunk.textDelta;
            if (!assistantStarted) {
              assistantStarted = true;
              setEvents((prev) => [...prev, { kind: 'assistant', content: assistantText }]);
            } else {
              setEvents((prev) => {
                const next = [...prev];
                for (let i = next.length - 1; i >= 0; i--) {
                  if (next[i].kind === 'assistant') {
                    next[i] = { kind: 'assistant', content: assistantText };
                    break;
                  }
                }
                return next;
              });
            }
            scrollToBottom();
          } else if (chunk.type === 'error' && chunk.error) {
            throw new Error(chunk.error);
          }
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, []);

  return (
    <div className="flex min-h-[70vh] flex-col rounded-2xl border border-border bg-panel-elevated/90">
      <div className="flex-1 space-y-3 overflow-y-auto p-4 md:p-6">
        {events.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            Ask anything about Vista docs. The agent will call{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
              search_knowledge_base
            </code>
            , retrieve chunks, then answer. Watch this panel and the terminal together.
          </div>
        )}

        {events.map((event, index) => {
          if (event.kind === 'user') {
            return (
              <div
                key={index}
                className="ml-auto max-w-[85%] rounded-2xl bg-primary px-4 py-3 text-sm text-white"
              >
                {event.content}
              </div>
            );
          }
          if (event.kind === 'tool-call') {
            return (
              <div
                key={index}
                className="max-w-[95%] rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 font-mono text-xs text-amber-800 dark:text-amber-200"
              >
                <div className="mb-1 font-semibold uppercase tracking-wide">
                  tool-call → {event.name}
                </div>
                <pre className="whitespace-pre-wrap break-words opacity-90">
                  {JSON.stringify(event.args, null, 2)}
                </pre>
              </div>
            );
          }
          if (event.kind === 'tool-result') {
            return (
              <div
                key={index}
                className="max-w-[95%] rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 font-mono text-xs text-emerald-900 dark:text-emerald-100"
              >
                <div className="mb-1 font-semibold uppercase tracking-wide">
                  tool-result ← {event.name}
                </div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words opacity-90">
                  {typeof event.result === 'string'
                    ? event.result
                    : JSON.stringify(event.result, null, 2)}
                </pre>
              </div>
            );
          }
          return (
            <div
              key={index}
              className="max-w-[90%] rounded-2xl border border-border bg-panel px-4 py-3 text-sm text-foreground"
            >
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                assistant
              </div>
              <div className="whitespace-pre-wrap leading-relaxed">{event.content}</div>
            </div>
          );
        })}

        {isLoading && (
          <div className="text-sm italic text-muted-foreground">Agent is searching / answering…</div>
        )}
        {error && <div className="text-sm text-red-600">Error: {error}</div>}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={isLoading}
              onClick={() => send(suggestion)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition hover:border-foreground/30 hover:text-foreground disabled:opacity-40"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the knowledge base…"
            disabled={isLoading}
            className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none ring-primary/40 focus:ring-2 disabled:opacity-50"
          />
          {isLoading ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-xl bg-red-600 px-4 py-3 text-sm font-medium text-white"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              className="rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white"
            >
              Send
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
