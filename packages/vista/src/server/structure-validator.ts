/**
 * Vista Structure Validator
 *
 * Deterministic, pure validation of the app/ directory structure.
 * Enforces Next.js-like conventions with strict error reporting.
 *
 * Issue codes are stable and consumed by the dev overlay, build output,
 * and any future tooling.
 */

import fs from 'fs';
import path from 'path';

// ============================================================================
// Types
// ============================================================================

export type IssueSeverity = 'error' | 'warning';

export type IssueCode =
  | 'ROOT_MISSING'
  | 'ROOT_EXPORT_MISSING'
  | 'LAYOUT_FALLBACK_USED'
  | 'RESERVED_NOT_FOUND_PUBLIC'
  | 'ROUTE_PATTERN_CONFLICT'
  | 'ROUTE_PAGE_CONFLICT'
  | 'INVALID_SEGMENT_NAME'
  | 'INVALID_NOT_FOUND_OVERRIDE_TARGET'
  | 'MULTIPLE_NOT_FOUND_SOURCES'
  | 'METADATA_EXPORT_SHAPE_INVALID'
  | 'FILE_CONVENTION_VIOLATION';

export interface StructureIssue {
  code: IssueCode;
  severity: IssueSeverity;
  message: string;
  filePath?: string;
  fix?: string;
}

export interface StructureValidationResult {
  state: 'ok' | 'error';
  issues: StructureIssue[];
  routeGraph: RouteGraphNode[];
  timestamp: number;
}

export interface RouteGraphNode {
  segment: string;
  pattern: string;
  kind:
    | 'static'
    | 'dynamic'
    | 'catch-all'
    | 'optional-catch-all'
    | 'group'
    | 'parallel'
    | 'interception'
    | 'reserved-internal';
  hasPage: boolean;
  hasLayout: boolean;
  children: RouteGraphNode[];
  filePath?: string;
}

// ============================================================================
// Constants
// ============================================================================

const FILE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];
const RESERVED_INTERNAL_SEGMENTS = new Set(['[not-found]']);
const CONVENTION_FILES = new Set([
  'page',
  'layout',
  'loading',
  'error',
  'not-found',
  'template',
  'default',
  'route',
]);

// ============================================================================
// Helpers
// ============================================================================

function fileExistsWithExtensions(dir: string, stem: string): string | null {
  for (const ext of FILE_EXTENSIONS) {
    const p = path.join(dir, `${stem}${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function isParallelSegment(name: string): boolean {
  return /^@[\w-]+$/.test(name);
}

function isInterceptionSegment(name: string): boolean {
  return /^(?:\(\.\)|\(\.\.\)|\(\.\.\)\(\.\.\)|\(\.\.\.\))(?:[\w-]+|\[[^\]]+\]|\[\[\.\.\.[^\]]+\]\])$/.test(
    name
  );
}

function isValidSegmentName(name: string): boolean {
  return (
    /^[a-zA-Z0-9_\-]+$/.test(name) ||
    /^\[\[\.\.\.[\w\-]+\]\]$/.test(name) ||
    /^\[[\w\-]+\]$/.test(name) ||
    /^\[\.\.\.[\w\-]+\]$/.test(name) ||
    /^\([\w\-]+\)$/.test(name) ||
    isParallelSegment(name) ||
    isInterceptionSegment(name)
  );
}

function classifySegment(name: string): RouteGraphNode['kind'] {
  if (RESERVED_INTERNAL_SEGMENTS.has(name)) return 'reserved-internal';
  if (isParallelSegment(name)) return 'parallel';
  if (isInterceptionSegment(name)) return 'interception';
  if (name.startsWith('(') && name.endsWith(')')) return 'group';
  if (name.startsWith('[[...') && name.endsWith(']]')) return 'optional-catch-all';
  if (name.startsWith('[...') && name.endsWith(']')) return 'catch-all';
  if (name.startsWith('[') && name.endsWith(']')) return 'dynamic';
  return 'static';
}

function segmentToPattern(segment: string, kind: RouteGraphNode['kind']): string {
  if (kind === 'dynamic') {
    const param = segment.slice(1, -1);
    return `:${param}`;
  }
  if (kind === 'catch-all') {
    const param = segment.slice(4, -1);
    return `:${param}*`;
  }
  if (kind === 'optional-catch-all') {
    const param = segment.slice(5, -2); // [[...slug]] -> slug
    return `:${param}*?`;
  }
  if (kind === 'group' || kind === 'parallel' || kind === 'interception') return '';
  return segment;
}

// ============================================================================
// Route Graph Builder
// ============================================================================

function buildRouteGraph(dir: string, parentPattern: string = ''): RouteGraphNode[] {
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const nodes: RouteGraphNode[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const name = entry.name;
    const kind = classifySegment(name);
    const patternPart = segmentToPattern(name, kind);
    const fullPattern = patternPart ? `${parentPattern}/${patternPart}` : parentPattern || '/';

    const childDir = path.join(dir, name);
    const hasPage = fileExistsWithExtensions(childDir, 'page') !== null;
    const hasLayout = fileExistsWithExtensions(childDir, 'layout') !== null;
    const pagePath = fileExistsWithExtensions(childDir, 'page');

    const children = buildRouteGraph(childDir, fullPattern);

    nodes.push({
      segment: name,
      pattern: fullPattern,
      kind,
      hasPage,
      hasLayout,
      children,
      filePath: pagePath ?? undefined,
    });
  }

  return nodes;
}

function collectPatterns(
  nodes: RouteGraphNode[],
  acc: Map<string, string[]> = new Map()
): Map<string, string[]> {
  for (const node of nodes) {
    if (node.kind === 'parallel' || node.kind === 'interception') {
      continue;
    }
    if (node.hasPage && node.kind !== 'reserved-internal') {
      // Normalize dynamic params so /blog/:id and /blog/:slug collide
      const normalizedPattern = node.pattern.replace(/:[^/]+/g, ':_dynamic_');
      const existing = acc.get(normalizedPattern) || [];
      existing.push(node.filePath || node.segment);
      acc.set(normalizedPattern, existing);
    }
    collectPatterns(node.children, acc);
  }
  return acc;
}

// ============================================================================
// Validation Rules
// ============================================================================

function checkRootExists(appDir: string, issues: StructureIssue[]): void {
  const rootPath = fileExistsWithExtensions(appDir, 'root');
  const layoutPath = fileExistsWithExtensions(appDir, 'layout');

  if (!rootPath && !layoutPath) {
    issues.push({
      code: 'ROOT_MISSING',
      severity: 'error',
      message: 'Missing app/root.(tsx|ts|jsx|js). No root entry point found.',
      fix: 'Create app/root.tsx with a default export component wrapping <html> and <body>.',
    });
    return;
  }

  if (!rootPath && layoutPath) {
    issues.push({
      code: 'LAYOUT_FALLBACK_USED',
      severity: 'warning',
      message: 'Using app/layout as fallback. Migrate to app/root.tsx (canonical Vista root).',
      filePath: layoutPath,
      fix: 'Rename app/layout.tsx to app/root.tsx.',
    });
  }

  const selectedPath = rootPath ?? layoutPath;
  if (selectedPath) {
    try {
      const source = fs.readFileSync(selectedPath, 'utf-8');
      // Check for default export (simple heuristic: export default)
      if (
        !source.includes('export default') &&
        !source.match(/export\s*\{\s*\w+\s+as\s+default\s*\}/)
      ) {
        issues.push({
          code: 'ROOT_EXPORT_MISSING',
          severity: 'error',
          message: `Root layout must export a default component: ${path.basename(selectedPath)}`,
          filePath: selectedPath,
          fix: 'Add "export default function Root({ children }) { ... }" to your root file.',
        });
      }
    } catch {
      // File read failure is transient, skip this check.
    }
  }
}

function checkReservedNotFoundPublic(nodes: RouteGraphNode[], issues: StructureIssue[]): void {
  for (const node of nodes) {
    if (node.kind === 'reserved-internal' && node.hasPage) {
      issues.push({
        code: 'RESERVED_NOT_FOUND_PUBLIC',
        severity: 'error',
        message: `Reserved segment "${node.segment}" must not be publicly routable. Remove page file from ${node.segment}/.`,
        filePath: node.filePath,
        fix: `The [not-found] segment is reserved for Vista's 404 handling. Do not add a page file inside it.`,
      });
    }
    checkReservedNotFoundPublic(node.children, issues);
  }
}

function checkRouteConflicts(patternMap: Map<string, string[]>, issues: StructureIssue[]): void {
  for (const [pattern, sources] of patternMap) {
    if (sources.length > 1) {
      issues.push({
        code: 'ROUTE_PATTERN_CONFLICT',
        severity: 'error',
        message: `Route pattern "${pattern}" is served by multiple sources: ${sources.join(', ')}`,
        fix: 'Remove or rename one of the conflicting route segments.',
      });
    }
  }
}

function checkRoutePageConflicts(appDir: string, issues: StructureIssue[]): void {
  walkRouteDirectories(appDir, (dir) => {
    const pageFile = fileExistsWithExtensions(dir, 'page');
    const routeFile = fileExistsWithExtensions(dir, 'route');
    if (pageFile && routeFile) {
      issues.push({
        code: 'ROUTE_PAGE_CONFLICT',
        severity: 'error',
        message: `Conflicting route and page at "${path.relative(appDir, dir) || '/'}" (${path.basename(pageFile)} and ${path.basename(routeFile)}). A route handler cannot exist at the same segment level as a page.`,
        filePath: routeFile,
        fix: `Remove either ${path.basename(pageFile)} or ${path.basename(routeFile)} from ${path.relative(appDir, dir) || 'app'}.`,
      });
    }
  });
}

function checkInvalidSegmentNames(dir: string, issues: StructureIssue[]): void {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const name = entry.name;
    // Skip hidden directories and reserved
    if (name.startsWith('.') || name === 'node_modules') continue;

    if (!isValidSegmentName(name) && !RESERVED_INTERNAL_SEGMENTS.has(name)) {
      issues.push({
        code: 'INVALID_SEGMENT_NAME',
        severity: 'error',
        message: `Invalid route segment name: "${name}". Segments must be alphanumeric/dashes, [param], [...param], (group), @slot, or interception syntax.`,
        filePath: path.join(dir, name),
        fix: `Rename "${name}" to a valid segment pattern (e.g., lowercase-dashed, [dynamic], (group), @modal, or (.)target).`,
      });
    }

    // Recurse into children
    checkInvalidSegmentNames(path.join(dir, name), issues);
  }
}

function checkNotFoundResolution(
  appDir: string,
  notFoundRoute: string | undefined,
  issues: StructureIssue[]
): void {
  // Check explicit notFoundRoute target validity
  if (notFoundRoute) {
    const normalized = notFoundRoute.startsWith('/') ? notFoundRoute : `/${notFoundRoute}`;
    const routeDir = path.join(appDir, normalized.slice(1));
    let found = false;
    for (const ext of FILE_EXTENSIONS) {
      if (fs.existsSync(path.join(routeDir, `page${ext}`))) {
        found = true;
        break;
      }
    }
    if (!found) {
      issues.push({
        code: 'INVALID_NOT_FOUND_OVERRIDE_TARGET',
        severity: 'error',
        message: `notFoundRoute "${notFoundRoute}" was configured but no page was found at ${routeDir}.`,
        fix: `Create a page file at app/${normalized.slice(1)}/page.tsx or correct the notFoundRoute value.`,
      });
    }
  }

  // Check for multiple not-found sources
  const hasAutoDetect = fileExistsWithExtensions(path.join(appDir, '[not-found]'), 'page') !== null;
  const hasLegacy = fileExistsWithExtensions(appDir, 'not-found') !== null;

  if (hasAutoDetect && hasLegacy && !notFoundRoute) {
    issues.push({
      code: 'MULTIPLE_NOT_FOUND_SOURCES',
      severity: 'warning',
      message:
        'Both app/[not-found]/page.* and app/not-found.* exist without an explicit notFoundRoute. Auto-detect (app/[not-found]/page.*) takes precedence.',
      fix: 'Remove one of the duplicates or set notFoundRoute in your root export to pick explicitly.',
    });
  }
}

function checkMetadataExportShape(appDir: string, issues: StructureIssue[]): void {
  // Walk all page and layout files, check that metadata exports look structurally valid
  walkFiles(appDir, (filePath) => {
    const ext = path.extname(filePath);
    if (!FILE_EXTENSIONS.includes(ext)) return;

    const stem = path.basename(filePath, ext);
    if (stem !== 'page' && stem !== 'layout' && stem !== 'root') return;

    try {
      const source = fs.readFileSync(filePath, 'utf-8');
      // Check for metadata export that's clearly not an object literal
      const metadataMatch = source.match(/export\s+const\s+metadata\s*[:=]\s*/);
      if (metadataMatch) {
        const afterMatch = source.slice((metadataMatch.index ?? 0) + metadataMatch[0].length);
        const firstChar = afterMatch.trimStart().charAt(0);
        // Structural check: must start with { (object) or be a type annotation followed by {
        if (firstChar !== '{' && !afterMatch.trimStart().startsWith('Metadata')) {
          // Could be a function call, string, number, etc.
          if (
            firstChar === '"' ||
            firstChar === "'" ||
            firstChar === '`' ||
            /^[0-9]/.test(afterMatch.trimStart())
          ) {
            issues.push({
              code: 'METADATA_EXPORT_SHAPE_INVALID',
              severity: 'error',
              message: `metadata export in ${path.relative(appDir, filePath)} must be an object, not a primitive.`,
              filePath,
              fix: 'Export metadata as an object: export const metadata = { title: "..." };',
            });
          }
        }
      }
    } catch {
      // Transient file read error, skip.
    }
  });
}

function checkFileConventions(appDir: string, issues: StructureIssue[]): void {
  // Walk route directories, flag non-convention files at route level
  walkRouteDirectories(appDir, (dir) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) continue;
      const ext = path.extname(entry.name);
      if (!FILE_EXTENSIONS.includes(ext)) continue;

      const stem = path.basename(entry.name, ext);
      // index is an alias for page
      if (stem === 'index') continue;
      // Allow globals.css and similar non-TS files at root
      if (dir === appDir && (stem === 'root' || stem === 'layout' || stem === 'not-found'))
        continue;

      if (!CONVENTION_FILES.has(stem)) {
        // This is NOT an error, just a note. We only flag true violations.
        // For now, collocated files are allowed. Convention check is informational.
      }
    }
  });
}

// ============================================================================
// File walking helpers
// ============================================================================

function walkFiles(dir: string, callback: (filePath: string) => void): void {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walkFiles(fullPath, callback);
    } else {
      callback(fullPath);
    }
  }
}

function walkRouteDirectories(dir: string, callback: (dirPath: string) => void): void {
  if (!fs.existsSync(dir)) return;
  callback(dir);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    walkRouteDirectories(path.join(dir, entry.name), callback);
  }
}

// ============================================================================
// Public API
// ============================================================================

export interface ValidateAppStructureInput {
  cwd: string;
  /** Optional notFoundRoute from the root module export. */
  notFoundRoute?: string;
}

export function validateAppStructure(input: ValidateAppStructureInput): StructureValidationResult {
  const { cwd, notFoundRoute } = input;
  const appDir = path.join(cwd, 'app');
  const issues: StructureIssue[] = [];

  // 1. Root exists
  checkRootExists(appDir, issues);

  // 2. Build route graph
  const routeGraph = buildRouteGraph(appDir);

  // 3. Reserved [not-found] must not be public
  checkReservedNotFoundPublic(routeGraph, issues);

  // 4. Route pattern conflicts
  const patternMap = collectPatterns(routeGraph);
  checkRouteConflicts(patternMap, issues);

  // 4b. Route vs page conflict
  checkRoutePageConflicts(appDir, issues);

  // 5. Invalid segment names
  checkInvalidSegmentNames(appDir, issues);

  // 6. Not-found resolution
  checkNotFoundResolution(appDir, notFoundRoute, issues);

  // 7. Metadata shape
  checkMetadataExportShape(appDir, issues);

  // 8. File convention
  checkFileConventions(appDir, issues);

  const hasErrors = issues.some((i) => i.severity === 'error');

  return {
    state: hasErrors ? 'error' : 'ok',
    issues,
    routeGraph,
    timestamp: Date.now(),
  };
}
