function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const KEYWORDS =
  /^(import|from|export|default|async|await|function|return|const|let|var|if|else|try|catch|throw|new|typeof|class|extends|of|in|for|while|true|false|null|undefined|type|interface)\b/;

const GQL_KEYWORDS = /^(query|mutation|subscription|fragment|on|type|input|enum|interface|implements|extend|schema|scalar)\b/;

/** Lightweight highlighter for home marketing code panes. */
export function highlightSource(
  source: string,
  language: 'ts' | 'tsx' | 'json' | 'graphql' = 'ts'
): string {
  if (language === 'json') return highlightJson(source);
  if (language === 'graphql') return highlightGraphql(source);

  let html = '';
  let i = 0;
  const text = source;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '/' && text[i + 1] === '/') {
      let j = i + 2;
      while (j < text.length && text[j] !== '\n') j += 1;
      html += `<span class="cmp-cmt">${escapeHtml(text.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) {
        if (text[j] === '\\') j += 2;
        else j += 1;
      }
      j = Math.min(j + 1, text.length);
      html += `<span class="cmp-str">${escapeHtml(text.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    if (ch === '<' && /[A-Za-z/]/.test(text[i + 1] || '')) {
      const tag = text.slice(i).match(/^<\/?[A-Za-z][\w.-]*/);
      if (tag) {
        html += `<span class="cmp-tag">${escapeHtml(tag[0])}</span>`;
        i += tag[0].length;
        continue;
      }
    }

    if (/[0-9]/.test(ch)) {
      const num = text.slice(i).match(/^\d+(\.\d+)?/);
      if (num) {
        html += `<span class="cmp-num">${escapeHtml(num[0])}</span>`;
        i += num[0].length;
        continue;
      }
    }

    if (/[A-Za-z_$]/.test(ch)) {
      const ident = text.slice(i).match(/^[A-Za-z_$][\w$]*/);
      if (ident) {
        const word = ident[0];
        const nextNonSpace = text.slice(i + word.length).match(/^\s*(\(|:)?/);
        if (KEYWORDS.test(word)) {
          html += `<span class="cmp-kw">${escapeHtml(word)}</span>`;
        } else if (word === 'GET' || word === 'POST' || word === 'Response' || word === 'fetch') {
          html += `<span class="cmp-fn">${escapeHtml(word)}</span>`;
        } else if (nextNonSpace && nextNonSpace[1] === '(') {
          html += `<span class="cmp-fn">${escapeHtml(word)}</span>`;
        } else if (/^[A-Z]/.test(word)) {
          html += `<span class="cmp-type">${escapeHtml(word)}</span>`;
        } else {
          html += escapeHtml(word);
        }
        i += word.length;
        continue;
      }
    }

    html += escapeHtml(ch);
    i += 1;
  }

  return html || '&nbsp;';
}

export function highlightGraphql(source: string): string {
  let html = '';
  let i = 0;
  const text = source;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '#' ) {
      let j = i + 1;
      while (j < text.length && text[j] !== '\n') j += 1;
      html += `<span class="cmp-cmt">${escapeHtml(text.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    if (ch === '"' ) {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\') j += 2;
        else j += 1;
      }
      j = Math.min(j + 1, text.length);
      html += `<span class="cmp-str">${escapeHtml(text.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      const num = text.slice(i).match(/^\d+(\.\d+)?/);
      if (num) {
        html += `<span class="cmp-num">${escapeHtml(num[0])}</span>`;
        i += num[0].length;
        continue;
      }
    }

    if (/[A-Za-z_]/.test(ch)) {
      const ident = text.slice(i).match(/^[A-Za-z_][\w]*/);
      if (ident) {
        const word = ident[0];
        if (GQL_KEYWORDS.test(word) || word === 'ID' || word === 'String' || word === 'Int' || word === 'Float' || word === 'Boolean') {
          html += `<span class="cmp-kw">${escapeHtml(word)}</span>`;
        } else if (/^[A-Z]/.test(word)) {
          html += `<span class="cmp-type">${escapeHtml(word)}</span>`;
        } else {
          html += `<span class="cmp-fn">${escapeHtml(word)}</span>`;
        }
        i += word.length;
        continue;
      }
    }

    html += escapeHtml(ch);
    i += 1;
  }

  return html || '&nbsp;';
}

export function highlightJson(source: string): string {
  return source.replace(
    /("(?:\\.|[^"\\])*")\s*(:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],]/g,
    (match, string, colon, bool) => {
      if (string !== undefined) {
        if (colon) {
          return `<span class="cmp-key">${escapeHtml(string)}</span><span class="cmp-punc">:</span>`;
        }
        return `<span class="cmp-str">${escapeHtml(string)}</span>`;
      }
      if (bool !== undefined) return `<span class="cmp-kw">${escapeHtml(bool)}</span>`;
      if (/^-?\d/.test(match)) return `<span class="cmp-num">${escapeHtml(match)}</span>`;
      return `<span class="cmp-punc">${escapeHtml(match)}</span>`;
    }
  );
}

export function highlightOutput(text: string, kind: 'idle' | 'ok' | 'error'): string {
  if (kind === 'error') {
    return text
      .split('\n')
      .map((line, index) => {
        if (line.startsWith('//')) {
          return `<span class="cmp-cmt">${escapeHtml(line)}</span>`;
        }
        if (index === 0 || /error|failed|unreachable|Could not/i.test(line)) {
          return `<span class="cmp-err">${escapeHtml(line)}</span>`;
        }
        return `<span class="cmp-err-dim">${escapeHtml(line)}</span>`;
      })
      .join('\n');
  }

  if (kind === 'idle') {
    return `<span class="cmp-cmt">${escapeHtml(text)}</span>`;
  }

  const lines = text.split('\n');
  const meta = lines[0]?.startsWith('//') ? lines[0] : '';
  const body = meta ? lines.slice(1).join('\n') : text;
  const head = meta ? `<span class="cmp-meta">${escapeHtml(meta)}</span>\n` : '';
  return head + highlightJson(body);
}
