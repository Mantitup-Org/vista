'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { closingNote } from '@/data/home';

export function ClosingNoteSection() {
  const reduceMotion = useReducedMotion();
  const { title, paragraphs } = closingNote;

  return (
    <section className="relative bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1440px] px-[clamp(1.5rem,4vw,3.5rem)] py-[clamp(4.5rem,10vh,7.5rem)]">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-4xl text-center"
        >
          <h2 className="text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-[1.15] tracking-[-0.035em] text-foreground">
            {title}
          </h2>
          <div className="mt-8 space-y-5 text-left text-[1.05rem] leading-relaxed text-foreground/65 sm:text-[1.1rem]">
            {paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 48)}>{paragraph}</p>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
