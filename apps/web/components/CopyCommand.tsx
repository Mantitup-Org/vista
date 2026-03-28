'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';
import { CREATE_VISTA_APP_COMMAND } from '../data/site';

export default function CopyCommand() {
    const [copied, setCopied] = useState(false);
    const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const command = CREATE_VISTA_APP_COMMAND;

    useEffect(() => {
        return () => {
            if (resetTimerRef.current) {
                clearTimeout(resetTimerRef.current);
                resetTimerRef.current = null;
            }
        };
    }, []);

    const markCopiedTemporarily = () => {
        setCopied(true);
        if (resetTimerRef.current) {
            clearTimeout(resetTimerRef.current);
        }
        resetTimerRef.current = setTimeout(() => {
            setCopied(false);
            resetTimerRef.current = null;
        }, 2000);
    };

    const copyWithFallback = async (text: string): Promise<boolean> => {
        if (typeof window === 'undefined') return false;

        if (window.isSecureContext && window.navigator?.clipboard?.writeText) {
            try {
                await window.navigator.clipboard.writeText(text);
                return true;
            } catch {
                // Fallback to legacy copy path below
            }
        }

        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.top = '0';
            textarea.style.left = '0';
            textarea.style.opacity = '0';
            textarea.style.pointerEvents = 'none';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            textarea.setSelectionRange(0, text.length);
            const successful = document.execCommand('copy');
            document.body.removeChild(textarea);
            return successful;
        } catch {
            return false;
        }
    };

    const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();

        const didCopy = await copyWithFallback(command);
        if (didCopy) {
            markCopiedTemporarily();
        } else {
            console.error('Failed to copy command to clipboard.');
        }
    };

    return (
        <div className="mt-8 flex justify-center">
            <button
                onClick={handleCopy}
                type="button"
                className="group flex cursor-pointer select-none items-center gap-2 rounded-full border border-border bg-panel-elevated/85 px-3 py-2 shadow-[0_14px_30px_rgba(15,23,42,0.08)] transition-all hover:bg-panel"
            >
                <Terminal size={14} className="text-muted-foreground" />
                <code className="text-sm font-mono text-foreground">
                    {command}
                </code>
                <div className="relative w-4 h-4 ml-1">
                    <div
                        className={`absolute inset-0 transition-all duration-300 transform ${copied ? 'opacity-0 scale-50' : 'opacity-100 scale-100'
                            }`}
                    >
                        <Copy size={14} className="text-muted-foreground transition-colors group-hover:text-foreground" />
                    </div>
                    <div
                        className={`absolute inset-0 transition-all duration-300 transform ${copied ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
                            }`}
                    >
                        <Check size={14} className="text-green-500" />
                    </div>
                </div>
            </button>
        </div>
    );
}
