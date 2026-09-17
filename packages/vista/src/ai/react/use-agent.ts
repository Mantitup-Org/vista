import { useState, useCallback, useRef } from 'react';
import type { Message, StreamChunk } from '../types';

export interface UseAgentOptions {
  api?: string;
  initialMessages?: Message[];
  sessionId?: string;
  onResponse?: (response: Response) => void;
  onFinish?: (message: Message) => void;
  onError?: (error: Error) => void;
}

export interface UseAgentResult {
  messages: Message[];
  input: string;
  setInput: (value: string) => void;
  handleInputChange: (e: any) => void;
  handleSubmit: (e?: any, options?: { prompt?: string }) => Promise<void>;
  isLoading: boolean;
  error: Error | null;
  stop: () => void;
  reload: () => Promise<void>;
}

export function useAgent(options: UseAgentOptions = {}): UseAgentResult {
  const {
    api = '/api/chat',
    initialMessages = [],
    sessionId,
    onResponse,
    onFinish,
    onError,
  } = options;

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleInputChange = useCallback((e: any) => {
    setInput(e?.target?.value ?? e);
  }, []);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  const sendPrompt = useCallback(
    async (promptToSend: string) => {
      if (!promptToSend.trim()) return;

      const userMessage: Message = { role: 'user', content: promptToSend };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput('');
      setIsLoading(true);
      setError(null);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const response = await fetch(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptToSend,
            messages: newMessages,
            sessionId,
          }),
          signal: abortController.signal,
        });

        onResponse?.(response);

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(errText || `Request failed with status ${response.status}`);
        }

        if (!response.body) {
          throw new Error('Response body is empty or not streamable');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantText = '';

        // Add empty assistant message that will stream
        setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

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
            if (payload === '[DONE]') break;

            try {
              const chunk: StreamChunk = JSON.parse(payload);
              if (chunk.type === 'text-delta' && chunk.textDelta) {
                assistantText += chunk.textDelta;
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                    updated[lastIdx] = {
                      ...updated[lastIdx],
                      content: assistantText,
                    };
                  }
                  return updated;
                });
              } else if (chunk.type === 'error' && chunk.error) {
                throw new Error(chunk.error);
              }
            } catch {
              // Ignore partial JSON chunks
            }
          }
        }

        const finalAssistantMessage: Message = {
          role: 'assistant',
          content: assistantText,
        };

        onFinish?.(finalAssistantMessage);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        onError?.(e);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [api, messages, sessionId, onResponse, onFinish, onError]
  );

  const handleSubmit = useCallback(
    async (e?: any, submitOptions?: { prompt?: string }) => {
      e?.preventDefault?.();
      const promptToSend = submitOptions?.prompt ?? input;
      await sendPrompt(promptToSend);
    },
    [input, sendPrompt]
  );

  const reload = useCallback(async () => {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMessage) {
      await sendPrompt(lastUserMessage.content);
    }
  }, [messages, sendPrompt]);

  return {
    messages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    stop,
    reload,
  };
}
