interface SignatureBlockProps {
  quote?: string;
}

const DEFAULT_QUOTE =
  'The goal is simple: help developers build faster with less code, while keeping the architecture clear enough to scale with confidence.';

export default function SignatureBlock({ quote = DEFAULT_QUOTE }: SignatureBlockProps) {
  return (
    <section className="mt-14 border-t border-dashed border-zinc-800 pt-10">
      <p className="text-sm uppercase tracking-[0.18em] text-zinc-500">Founder Note</p>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-300">"{quote}"</p>

      <div className="mt-8 flex flex-col items-start">
        <img
          src="/signature.svg"
          alt="Ankan Dalui Signature"
          width={320}
          height={110}
          className="mb-1 -ml-8 opacity-80 invert"
        />
        <p className="text-sm font-medium text-zinc-500">Ankan Dalui, Founder, Vista.js</p>
      </div>
    </section>
  );
}
