import Image from 'vista/image';

interface SignatureBlockProps {
  quote?: string;
}

const DEFAULT_QUOTE =
  'The goal is simple: help developers build faster with less code, while keeping the architecture clear enough to scale with confidence.';

export default function SignatureBlock({ quote = DEFAULT_QUOTE }: SignatureBlockProps) {
  return (
    <section className="rounded-[1.8rem] border border-border bg-panel-elevated/85 p-6 shadow-[0_20px_45px_rgba(15,23,42,0.06)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Founder note
      </p>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-foreground">"{quote}"</p>

      <div className="mt-8 flex flex-col items-start">
        <Image
          src="/signature.svg"
          alt="Ankan Dalui Signature"
          width={320}
          height={110}
          className="mb-1 -ml-8 h-auto w-[240px] opacity-70 dark:invert"
        />
        <p className="text-sm font-medium text-muted-foreground">Ankan Dalui, Founder, Vista.js</p>
      </div>
    </section>
  );
}
