interface SignatureBlockProps {
  quote?: string;
}

const DEFAULT_QUOTE =
  'The goal is simple: help developers build faster with less code, while keeping the architecture clear enough to scale with confidence.';

export default function SignatureBlock({ quote = DEFAULT_QUOTE }: SignatureBlockProps) {
  return (
    <section className="mt-14 border-t border-dashed border-foreground/12 pt-10">
      <p className="text-sm uppercase tracking-[0.18em] text-foreground/45">Founder Note</p>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-foreground/74">"{quote}"</p>

      <div className="mt-8 flex flex-col items-start">
        <img
          src="/signature.svg"
          alt="Ankan Dalui Signature"
          width={320}
          height={110}
          className="mb-1 -ml-8 opacity-80 dark:invert"
        />
        <p className="text-sm font-medium text-foreground/55">Ankan Dalui, Founder, Vista.js</p>
      </div>
    </section>
  );
}
