interface SignatureBlockProps {
  quote?: string;
}

const DEFAULT_QUOTE =
  'The goal is simple: help developers build faster with less code, while keeping the architecture clear enough to scale with confidence.';

export default function SignatureBlock({ quote = DEFAULT_QUOTE }: SignatureBlockProps) {
  return (
    <aside className="border-l-2 border-foreground/15 pl-4">
      <p className="text-[13px] font-medium text-foreground/45">Creator note</p>
      <p className="mt-2 max-w-2xl text-[15px] leading-7 text-foreground/65">“{quote}”</p>
      <div className="mt-5 flex flex-col items-start">
        <img
          src="/signature.svg"
          alt="Ankan Dalui Signature"
          width={240}
          height={82}
          className="mb-1 -ml-6 opacity-70 dark:invert"
        />
        <p className="text-[13px] text-foreground/45">Ankan Dalui, Creator</p>
      </div>
    </aside>
  );
}
