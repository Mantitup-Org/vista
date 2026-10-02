export interface AuthSnippet {
  path: string;
  language: 'ts' | 'tsx';
  source: string;
  caption: string;
}

export interface AuthSectionContent {
  title: string;
  titleMuted: string;
  body: string;
  connector: string;
  config: AuthSnippet;
  middleware: AuthSnippet;
  page: AuthSnippet;
}
