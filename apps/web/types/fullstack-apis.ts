export interface FullstackApisTreeLine {
  text: string;
  /** Emphasize the line that proves the feature. */
  highlight?: boolean;
  muted?: boolean;
  /** File id to open when this tree row is clicked. */
  fileId?: string;
}

export interface FullstackApisFile {
  id: string;
  /** Path shown in the editor tab. */
  path: string;
  language: 'ts' | 'tsx' | 'json';
  /** Starting source in the editor. */
  source: string;
  /**
   * How Run behaves:
   * - route: execute GET/POST with a mock Response
   * - page: call this side's route file in-process (Vista) or simulate a remote API
   * - config: not runnable
   */
  runKind: 'route' | 'page' | 'config';
}

export interface FullstackApisSide {
  label: string;
  caption: string;
  tree: FullstackApisTreeLine[];
  files: FullstackApisFile[];
  /** File opened by default. */
  defaultFileId: string;
  /** Which file supplies the in-memory API for page runs. */
  routeFileId?: string;
}

export interface FullstackApisSectionContent {
  title: string;
  titleMuted: string;
  body: string;
  before: FullstackApisSide;
  after: FullstackApisSide;
}
