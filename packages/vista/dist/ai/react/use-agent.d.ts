import type { Message } from '../types';
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
    handleSubmit: (e?: any, options?: {
        prompt?: string;
    }) => Promise<void>;
    isLoading: boolean;
    error: Error | null;
    stop: () => void;
    reload: () => Promise<void>;
}
export declare function useAgent(options?: UseAgentOptions): UseAgentResult;
