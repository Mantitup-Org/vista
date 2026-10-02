import type {
  ArchitectureCanvas,
  ArchitectureEdge,
  ArchitectureNode,
  RuntimeStep,
} from '@/types/architecture';

export const architectureCanvas: ArchitectureCanvas = {
  width: 1080,
  height: 490,
};

export const architectureNodes: ArchitectureNode[] = [
  { id: 'pages', x: 16, y: 191, w: 200, h: 108, label: 'Pages', sub: 'app/' },
  { id: 'apis', x: 292, y: 16, w: 200, h: 108, label: 'APIs', sub: 'route.ts' },
  { id: 'auth', x: 568, y: 64, w: 200, h: 108, label: 'Auth', sub: 'sessions' },
  { id: 'agents', x: 844, y: 24, w: 200, h: 108, label: 'Agents', sub: 'stream' },
  {
    id: 'typed',
    x: 276,
    y: 280,
    w: 232,
    h: 160,
    label: 'Typed procedures',
    lines: ['createCaller', 'rsc → api', 'same app/'],
  },
  {
    id: 'runtime',
    x: 552,
    y: 300,
    w: 232,
    h: 160,
    label: 'Runtime',
    lines: ['SSR / RSC', 'middleware', 'one process'],
  },
  {
    id: 'ai',
    x: 828,
    y: 268,
    w: 232,
    h: 160,
    label: 'AI layer',
    lines: ['vista/ai', 'tools + RAG', 'g agent'],
  },
];

export const architectureEdges: ArchitectureEdge[] = [
  { id: 'e1', from: 'pages', to: 'apis', fromSide: 'top', toSide: 'left' },
  { id: 'e2', from: 'apis', to: 'auth', fromSide: 'right', toSide: 'left' },
  { id: 'e3', from: 'auth', to: 'agents', fromSide: 'right', toSide: 'left' },
  { id: 'e4', from: 'apis', to: 'typed', fromSide: 'bottom', toSide: 'top' },
  { id: 'e5', from: 'auth', to: 'runtime', fromSide: 'bottom', toSide: 'top' },
  { id: 'e6', from: 'agents', to: 'ai', fromSide: 'bottom', toSide: 'top' },
  { id: 'e7', from: 'typed', to: 'runtime', fromSide: 'right', toSide: 'left' },
  { id: 'e8', from: 'runtime', to: 'ai', fromSide: 'right', toSide: 'left' },
];

export const runtimeSteps: RuntimeStep[] = [
  {
    id: 'pages',
    title: 'Pages',
    description:
      'File-system routes under app/. Nested layouts, dynamic segments, Server Components by default.',
    nodes: ['pages'],
    edges: [],
  },
  {
    id: 'apis',
    title: 'APIs',
    description:
      'route.ts handlers and typed procedures in the same tree — call them from RSC with createCaller.',
    nodes: ['pages', 'apis', 'typed'],
    edges: ['e1', 'e4'],
  },
  {
    id: 'auth',
    title: 'Auth',
    description:
      'Sessions, OAuth, and fail-closed middleware that ships with the scaffold — not bolted on later.',
    nodes: ['pages', 'apis', 'auth', 'typed', 'runtime'],
    edges: ['e1', 'e2', 'e4', 'e5', 'e7'],
  },
  {
    id: 'agents',
    title: 'Agents',
    description:
      'Streaming agents and RAG on the same runtime. One provider:model string — Groq, NIM, OpenAI, and more.',
    nodes: ['pages', 'apis', 'auth', 'agents', 'typed', 'runtime', 'ai'],
    edges: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'],
  },
];

const nodesById = new Map(architectureNodes.map((node) => [node.id, node]));

export function getArchitectureNode(id: string): ArchitectureNode {
  const node = nodesById.get(id);
  if (!node) throw new Error(`Missing architecture node: ${id}`);
  return node;
}
