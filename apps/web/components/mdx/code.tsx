import { CopyButton } from './copy-button';

interface CodeProps {
  title?: string;
  language: string;
  code: string;
}

type TokenType =
  | 'plain'
  | 'comment'
  | 'string'
  | 'keyword'
  | 'boolean'
  | 'number'
  | 'function'
  | 'operator'
  | 'flag';

interface TokenPart {
  type: TokenType;
  value: string;
}

const TS_JS_REGEX =
  /(?<comment>\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(?<string>`(?:\\.|[^`])*`|'(?:\\.|[^'])*'|"(?:\\.|[^"])*")|(?<keyword>\b(?:import|from|export|default|const|let|var|function|return|async|await|if|else|for|while|switch|case|break|try|catch|throw|new|class|interface|type|extends|implements|as|in|of)\b)|(?<boolean>\b(?:true|false|null|undefined)\b)|(?<number>\b\d+(?:\.\d+)?\b)|(?<function>\b[A-Za-z_$][A-Za-z0-9_$]*(?=\())|(?<operator>[=+\-*/%<>!&|?:]+)/g;

const SHELL_REGEX =
  /(?<comment>#[^\n]*)|(?<string>"(?:\\.|[^"])*"|'(?:\\.|[^'])*')|(?<keyword>\b(?:npm|npx|pnpm|yarn|cd|git|node|bun|lerna|vista)\b)|(?<flag>--?[a-zA-Z][\w-]*)|(?<number>\b\d+\b)|(?<operator>[|&><=]+)/g;

function pickRegex(language: string): RegExp | null {
  const normalized = language.toLowerCase();
  if (normalized === 'txt' || normalized === 'text' || normalized === 'prompt') {
    return null;
  }
  if (normalized === 'bash' || normalized === 'sh' || normalized === 'shell') {
    return SHELL_REGEX;
  }
  return TS_JS_REGEX;
}

function tokenize(code: string, language: string): TokenPart[] {
  const regex = pickRegex(language);
  if (!regex) {
    return [{ type: 'plain', value: code }];
  }

  regex.lastIndex = 0;
  const tokens: TokenPart[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null = null;

  while ((match = regex.exec(code)) !== null) {
    const start = match.index;
    const value = match[0];

    if (start > cursor) {
      tokens.push({ type: 'plain', value: code.slice(cursor, start) });
    }

    const groups = match.groups ?? {};
    let type: TokenType = 'plain';

    if (groups.comment) type = 'comment';
    else if (groups.string) type = 'string';
    else if (groups.keyword) type = 'keyword';
    else if (groups.boolean) type = 'boolean';
    else if (groups.number) type = 'number';
    else if (groups.function) type = 'function';
    else if (groups.operator) type = 'operator';
    else if (groups.flag) type = 'flag';

    tokens.push({ type, value });
    cursor = start + value.length;
  }

  if (cursor < code.length) {
    tokens.push({ type: 'plain', value: code.slice(cursor) });
  }

  return tokens;
}

function getTokenClassName(type: TokenType): string {
  switch (type) {
    case 'comment':
      return 'text-zinc-500';
    case 'string':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'keyword':
      return 'text-sky-700 dark:text-sky-300';
    case 'boolean':
      return 'text-violet-700 dark:text-violet-300';
    case 'number':
      return 'text-amber-700 dark:text-amber-300';
    case 'function':
      return 'text-cyan-700 dark:text-cyan-300';
    case 'operator':
      return 'text-pink-700 dark:text-pink-300';
    case 'flag':
      return 'text-fuchsia-700 dark:text-fuchsia-300';
    default:
      return 'text-zinc-800 dark:text-zinc-200';
  }
}

export function Code({ title, language, code }: CodeProps) {
  const tokens = tokenize(code, language);
  const isPrompt = language.toLowerCase() === 'prompt';
  const label = title || (isPrompt ? 'Copy for AI agents' : language);

  return (
    <div className="overflow-hidden rounded-lg border border-foreground/10 bg-foreground/[0.03] dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3 border-b border-foreground/10 px-3 py-1.5 sm:px-4">
        <p className="min-w-0 truncate text-[12px] font-medium text-foreground/50">{label}</p>
        <CopyButton value={code} label={isPrompt ? 'Copy prompt' : 'Copy'} />
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-6">
        <code className="whitespace-pre">
          {tokens.map((token, index) => (
            <span key={`${token.type}-${index}`} className={getTokenClassName(token.type)}>
              {token.value}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
