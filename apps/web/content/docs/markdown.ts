import { readFileSync } from 'fs';
import type { DocsDocSection, DocsDocSource } from './types';

type Frontmatter = Record<string, string>;

type ParsedLink = {
  label: string;
  href: string;
  external?: boolean;
};

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(markdown: string, sourceName: string): { frontmatter: Frontmatter; body: string } {
  const normalized = markdown.replace(/\r\n/g, '\n');

  if (!normalized.startsWith('---\n')) {
    throw new Error(`Missing frontmatter in docs markdown: ${sourceName}`);
  }

  const closingIndex = normalized.indexOf('\n---\n', 4);
  if (closingIndex === -1) {
    throw new Error(`Unclosed frontmatter block in docs markdown: ${sourceName}`);
  }

  const frontmatterBlock = normalized.slice(4, closingIndex);
  const body = normalized.slice(closingIndex + '\n---\n'.length);
  const frontmatter: Frontmatter = {};

  for (const rawLine of frontmatterBlock.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) {
      throw new Error(`Invalid frontmatter line "${rawLine}" in ${sourceName}`);
    }
    const [, key, rawValue] = match;
    frontmatter[key] = stripQuotes(rawValue);
  }

  return { frontmatter, body };
}

function requireFrontmatterValue(frontmatter: Frontmatter, key: string, sourceName: string): string {
  const value = frontmatter[key]?.trim();
  if (!value) {
    throw new Error(`Missing required frontmatter key "${key}" in ${sourceName}`);
  }
  return value;
}

function normalizeInlineMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBlockStart(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('```') ||
    /^##\s+/.test(trimmed) ||
    /^###\s+/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^[-*]\s+/.test(trimmed)
  );
}

function parseFenceInfo(info: string): { language: string; title?: string } {
  const trimmed = info.trim();
  if (!trimmed) {
    return { language: 'text' };
  }

  const language = trimmed.split(/\s+/)[0] || 'text';
  const titleMatch = /(?:^|\s)title=(?:"([^"]+)"|'([^']+)')/.exec(trimmed);
  const title = titleMatch ? titleMatch[1] || titleMatch[2] : undefined;
  return { language, title };
}

function parseLinkListItem(value: string): ParsedLink | null {
  const match = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(value.trim());
  if (!match) return null;

  const label = match[1].trim();
  const href = match[2].trim();
  const isExternal = /^(https?:\/\/|mailto:|tel:)/i.test(href);
  return {
    label,
    href,
    external: isExternal ? true : undefined,
  };
}

function parseSections(body: string): DocsDocSection[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const sections: DocsDocSection[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      i += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const fence = parseFenceInfo(line.slice(3));
      i += 1;
      const codeLines: string[] = [];

      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }

      if (i < lines.length && lines[i].trim().startsWith('```')) {
        i += 1;
      }

      sections.push({
        type: 'code',
        language: fence.language,
        code: codeLines.join('\n').trimEnd(),
        title: fence.title,
      });
      continue;
    }

    if (/^###\s+/.test(line)) {
      sections.push({
        type: 'heading',
        level: 3,
        text: line.replace(/^###\s+/, '').trim(),
      });
      i += 1;
      continue;
    }

    if (/^##\s+/.test(line)) {
      sections.push({
        type: 'heading',
        level: 2,
        text: line.replace(/^##\s+/, '').trim(),
      });
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }

      sections.push({
        type: 'quote',
        text: normalizeInlineMarkdown(quoteLines.join(' ')),
      });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const rawItems: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        rawItems.push(lines[i].trim().replace(/^[-*]\s+/, '').trim());
        i += 1;
      }

      const parsedLinks = rawItems
        .map((item) => parseLinkListItem(item))
        .filter((item): item is ParsedLink => item !== null);
      const previous = sections[sections.length - 1];
      const isRelatedLinksList =
        parsedLinks.length === rawItems.length &&
        previous?.type === 'heading';

      if (isRelatedLinksList) {
        const relatedHeading = sections.pop();
        sections.push({
          type: 'links',
          title: relatedHeading?.type === 'heading' ? relatedHeading.text : 'Related',
          links: parsedLinks,
        });
      } else {
        sections.push({
          type: 'list',
          items: rawItems.map((item) => normalizeInlineMarkdown(item)),
        });
      }
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const candidate = lines[i].trim();
      if (!candidate || isBlockStart(candidate)) {
        break;
      }
      paragraphLines.push(candidate);
      i += 1;
    }

    const paragraphText = normalizeInlineMarkdown(paragraphLines.join(' '));
    if (paragraphText) {
      sections.push({
        type: 'paragraph',
        text: paragraphText,
      });
    }
  }

  return sections;
}

export function loadMarkdownDoc(relativePath: string): DocsDocSource {
  const sourceUrl = new URL(relativePath, import.meta.url);
  const sourceName = sourceUrl.pathname;
  const markdown = readFileSync(sourceUrl, 'utf8');
  const { frontmatter, body } = parseFrontmatter(markdown, sourceName);
  const orderValue = Number(requireFrontmatterValue(frontmatter, 'order', sourceName));

  if (!Number.isFinite(orderValue)) {
    throw new Error(`Invalid numeric "order" value in ${sourceName}`);
  }

  return {
    category: requireFrontmatterValue(frontmatter, 'category', sourceName),
    slug: requireFrontmatterValue(frontmatter, 'slug', sourceName),
    title: requireFrontmatterValue(frontmatter, 'title', sourceName),
    summary: requireFrontmatterValue(frontmatter, 'summary', sourceName),
    order: orderValue,
    updatedAt: requireFrontmatterValue(frontmatter, 'updatedAt', sourceName),
    signatureQuote: frontmatter.signatureQuote?.trim() || undefined,
    sections: parseSections(body),
  };
}
