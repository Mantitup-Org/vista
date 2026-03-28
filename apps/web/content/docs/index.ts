import { docsCategoryConfig } from './categories';
import { loadMarkdownDoc } from './markdown';
import type { CollectedDoc, CollectedHeading, DocsDocSource } from './types';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractHeadings(sections: DocsDocSource['sections']): CollectedHeading[] {
  const headings: CollectedHeading[] = [];
  const used = new Set<string>();

  for (const section of sections) {
    if (section.type !== 'heading') continue;
    const baseId = section.id ? slugify(section.id) : slugify(section.text);
    let id = baseId;
    let index = 2;
    while (used.has(id)) {
      id = `${baseId}-${index}`;
      index += 1;
    }
    used.add(id);
    headings.push({
      id,
      text: section.text,
      level: section.level,
    });
  }

  return headings;
}

const docsSource: DocsDocSource[] = [
  loadMarkdownDoc('./introduction/the-beginning-of-vista.md'),
  loadMarkdownDoc('./introduction/architecture-of-simplicity.md'),
  loadMarkdownDoc('./getting-started/first-steps.md'),
  loadMarkdownDoc('./getting-started/project-structure.md'),
  loadMarkdownDoc('./getting-started/typed-api-quickstart.md'),
  loadMarkdownDoc('./core-concepts/routing-overview.md'),
  loadMarkdownDoc('./core-concepts/dynamic-routes-and-slugs.md'),
  loadMarkdownDoc('./core-concepts/api-routes-vs-typed-api.md'),
  loadMarkdownDoc('./core-concepts/typed-api-runtime-flow.md'),
  loadMarkdownDoc('./cli-workflow/create-and-generate.md'),
  loadMarkdownDoc('./reference/vista-config-reference.md'),
  loadMarkdownDoc('./reference/project-file-structure.md'),
  loadMarkdownDoc('./reference/typed-client-reference.md'),
  loadMarkdownDoc('./reference/bench-architecture.md'),
  loadMarkdownDoc('./reference/engine-variants-default-vs-flashpack.md'),
  loadMarkdownDoc('./reference/flashpack-architecture.md'),
  loadMarkdownDoc('./reference/rust-crates-and-napi-bridge.md'),
  loadMarkdownDoc('./deployment/render-deployment.md'),
  loadMarkdownDoc('./deployment/vercel-deployment.md'),
];

export const allDocs: CollectedDoc[] = docsSource.map((doc) => ({
  ...doc,
  _meta: {
    path: `${doc.category}/${doc.slug}`,
  },
  headings: extractHeadings(doc.sections),
}));

export { docsCategoryConfig };
export type { CollectedDoc, CollectedHeading, DocsCategoryConfig, DocsDocSection, DocsDocSource } from './types';
