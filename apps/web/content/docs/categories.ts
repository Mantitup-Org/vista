import type { DocsCategoryConfig } from './types';

export const docsCategoryConfig: DocsCategoryConfig[] = [
  {
    id: 'introduction',
    title: 'Introduction',
    description: 'Vision, story, and why Vista exists.',
    order: 1,
  },
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Install, bootstrap, and build your first production path.',
    order: 2,
  },
  {
    id: 'core-concepts',
    title: 'Core Concepts',
    description: 'Routing, APIs, runtime behavior, and architecture contracts.',
    order: 3,
  },
  {
    id: 'ai',
    title: 'AI',
    description: 'Native agents, tools, streaming, and model providers.',
    order: 4,
  },
  {
    id: 'cli-workflow',
    title: 'CLI Workflow',
    description: 'Scaffold, generate, and standardize team workflows.',
    order: 5,
  },
  {
    id: 'reference',
    title: 'Reference',
    description: 'Config options, API signatures, and file maps.',
    order: 6,
  },
  {
    id: 'deployment',
    title: 'Deployment',
    description: 'Release, publish, and production checks.',
    order: 7,
  },
];
