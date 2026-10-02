'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy } from 'lucide-react';
import { CREATE_VISTA_APP_COMMAND } from '@/data/site';

export function HeroCopyCommand() {
  const [copied, setCopied] = useState(false);
  const command = CREATE_VISTA_APP_COMMAND;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can fail in insecure contexts; keep UI quiet.
    }
  };

  return (
    <motion.button
      type="button"
      onClick={handleCopy}
      initial={{ opacity: 0, y: 14, filter: 'blur(16px)', scale: 0.94 }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)', scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 120,
        damping: 18,
        mass: 0.9,
        delay: 0.35,
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="group pointer-events-auto mt-[clamp(0.85rem,2vh,1.35rem)] inline-flex max-w-full cursor-pointer items-center gap-2 rounded-full border border-foreground/15 bg-foreground/[0.06] px-3 py-1 text-left transition-[border-color,background-color] hover:border-foreground/30 hover:bg-foreground/[0.1]"
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
    </motion.button>
  );
}
