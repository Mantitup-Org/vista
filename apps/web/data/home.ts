import type { ClosingNoteContent, HeroContent, RuntimeSectionContent } from '@/types/home';

export const heroContent: HeroContent = {
  lines: [
    { text: 'Your app.', muted: true },
    { text: 'Our runtime.' },
  ],
  aside: [
    { text: 'Built for React that grows —', indentClass: 'ml-[2.6em]' },
    { text: 'pages first, then APIs,', indentClass: 'ml-[1.7em]' },
    { text: 'auth, and agents without', indentClass: 'ml-[0.85em]' },
    { text: 'leaving the same project.', indentClass: 'ml-0' },
  ],
};

export const runtimeSection: RuntimeSectionContent = {
  kicker: '02 / Runtime',
  title: 'One directory.',
  titleMuted: 'Full stack.',
  dockCaption: ['Copy', 'the', 'command', 'to', 'get', 'started'],
};

export const closingNote: ClosingNoteContent = {
  title: 'Stay in one project as the product grows.',
  paragraphs: [
    'Vista is built for the path most apps actually take. You start with pages under app/. When you need a handler, it lives next to the screen that calls it. When you need a session, auth and fail-closed middleware ship from the same scaffold. When you need a model in the loop, agents and tools run on that same runtime — one provider:model string, not a second service folder.',
    'The point is not to replace every tool you already know. It is to keep UI, APIs, auth, and AI in one directory so the request path stays obvious: edit a file, run it, ship it. Typed procedures, route handlers, and streaming agents share the process your React tree already lives in.',
    'If you are still deciding where the backend should sit, start here. Create the app, grow the tree, and move a contract out later only when the product asks for it — not because the framework forced a split on day one.',
  ],
};
