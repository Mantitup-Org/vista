export interface AgentsSnippet {
  path: string;
  language: 'ts' | 'tsx';
  source: string;
  caption: string;
}

export interface AgentsSectionContent {
  title: string;
  titleMuted: string;
  body: string;
  connector: string;
  agent: AgentsSnippet;
  route: AgentsSnippet;
  client: AgentsSnippet;
}
