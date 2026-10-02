'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CopyButtonProps {
  value: string;
  className?: string;
  label?: string;
}

export function CopyButton({ value, className, label = 'Copy' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can fail in non-secure contexts; ignore silently.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-foreground/55 transition-colors hover:bg-foreground/[0.06] hover:text-foreground',
        className
      )}
      aria-label={copied ? 'Copied' : label}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  );
}
