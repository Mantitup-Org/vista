/**
 * Returns a JS snippet that installs the Vista dev error overlay.
 * It supports Next.js-style error pagination and indicator restore.
 */
export function getDevErrorOverlayBootstrapSource(): string {
  return String.raw`
(function installVistaDevErrorOverlay() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__VISTA_DEV_ERROR_OVERLAY__) return;

  var STYLE_ID = '__vista-dev-error-overlay-style';
  var ROOT_ID = '__vista-dev-error-overlay';
  var root = null;
  var messageNode = null;
  var titleNode = null;
  var detailNode = null;
  var filesWrapNode = null;
  var filesNode = null;
  var tabNameNodes = null;
  var crumbsNode = null;
  var statusLnNode = null;
  var statusLangNode = null;
  var kindNode = null;
  var sourceBadgeNode = null;
  var fileTabsNode = null;
  var copyButton = null;
  var minimizeButton = null;
  var reloadButton = null;
  var paginationNode = null;
  var prevButton = null;
  var nextButton = null;
  var countNode = null;
  var mainNode = null;
  var panelExpandButton = null;
  var listenersBound = false;
  var state = {
    open: false,
    minimized: false,
    entries: [],
    activeIndex: 0,
    fileTab: 0,
  };

  function getIndicator() {
    return window.__VISTA_DEVTOOLS_INDICATOR__;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function highlightSource(text) {
    var html = '';
    var i = 0;
    var keywords = /^(import|from|function|return|const|let|var|export|default|class|extends|if|else|async|await|new|type|interface|true|false|null|undefined|typeof|void|as|of|in|for|while|switch|case|break|continue|try|catch|finally|this)\b/;
    while (i < text.length) {
      var ch = text.charAt(i);
      if (ch === "'" || ch === '"' || ch === String.fromCharCode(96)) {
        var j = i + 1;
        while (j < text.length && text.charAt(j) !== ch) {
          j += text.charAt(j) === '\\' ? 2 : 1;
        }
        html += '<span class="vista-tok-str">' + escapeHtml(text.slice(i, Math.min(j + 1, text.length))) + '</span>';
        i = j + 1;
        continue;
      }
      if (ch === '/' && text.charAt(i + 1) === '/') {
        html += '<span class="vista-tok-cmt">' + escapeHtml(text.slice(i)) + '</span>';
        break;
      }
      if (ch === '<' && /[A-Za-z/]/.test(text.charAt(i + 1) || '')) {
        var tag = text.slice(i).match(/^<\/?[A-Za-z][\w.-]*/);
        if (tag) {
          html += '<span class="vista-tok-tag">' + escapeHtml(tag[0]) + '</span>';
          i += tag[0].length;
          continue;
        }
      }
      if (/[A-Za-z_$]/.test(ch)) {
        var ident = text.slice(i).match(/^[A-Za-z_$][\w$]*/);
        if (ident) {
          html += keywords.test(ident[0])
            ? '<span class="vista-tok-kw">' + escapeHtml(ident[0]) + '</span>'
            : escapeHtml(ident[0]);
          i += ident[0].length;
          continue;
        }
      }
      html += escapeHtml(ch);
      i += 1;
    }
    return html;
  }

  function fileBasename(file) {
    var normalized = String(file || '').replace(/\\/g, '/').replace(/:\d+(?::\d+)?$/, '');
    return normalized.split('/').filter(Boolean).pop() || 'untitled';
  }

  function fileBreadcrumb(file) {
    var normalized = String(file || '').replace(/\\/g, '/').replace(/:\d+(?::\d+)?$/, '');
    return normalized.split('/').filter(Boolean).join(' › ') || 'Source';
  }

  function languageFromFile(file) {
    var ext = String(file || '').replace(/:\d+(?::\d+)?$/, '').split('.').pop().toLowerCase();
    if (ext === 'tsx') return 'TypeScript React';
    if (ext === 'ts') return 'TypeScript';
    if (ext === 'jsx') return 'JavaScript React';
    if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return 'JavaScript';
    if (ext === 'css') return 'CSS';
    if (ext === 'json') return 'JSON';
    return 'Plain Text';
  }

  function parseFileLocation(file) {
    var match = String(file || '').match(/:(\d+)(?::(\d+))?$/);
    return {
      line: match ? Number(match[1]) : 0,
      column: match && match[2] ? Number(match[2]) : 1,
    };
  }

  function renderIdeCode(codeFrame, errorLine, errorColumn) {
    var rawLines = String(codeFrame || '').split(/\r?\n/);
    var rows = [];
    for (var i = 0; i < rawLines.length; i += 1) {
      var line = rawLines[i];
      var numbered = line.match(/^(\s*>)?\s*(\d+)\s+\|(.*)$/);
      if (!numbered) continue;
      var src = numbered[3];
      if (src.charAt(0) === ' ') src = src.slice(1);
      var isError = !!(numbered[1] && numbered[1].indexOf('>') !== -1);
      var squiggleAt = -1;
      var next = rawLines[i + 1] || '';
      var caret = next.match(/\|(.*)$/);
      if (caret && caret[1].indexOf('^') !== -1) {
        var mark = caret[1];
        if (mark.charAt(0) === ' ') mark = mark.slice(1);
        squiggleAt = Math.max(0, mark.indexOf('^'));
        isError = true;
        i += 1;
      }
      rows.push({ n: Number(numbered[2]), text: src, error: isError, squiggleAt: squiggleAt });
    }
    if (!rows.length) {
      return '<div class="vista-error-editor"><div class="vista-error-editor-line"><span class="vista-error-gutter"></span><span class="vista-error-source">' + highlightSource(String(codeFrame || '')) + '</span></div></div>';
    }
    var min = rows[0].n;
    var max = rows[0].n;
    var byN = {};
    for (var r = 0; r < rows.length; r += 1) {
      byN[rows[r].n] = rows[r];
      if (rows[r].n < min) min = rows[r].n;
      if (rows[r].n > max) max = rows[r].n;
    }
    var html = '';
    for (var n = min; n <= max; n += 1) {
      var row = byN[n] || { n: n, text: '', error: Number(errorLine) === n, squiggleAt: -1 };
      if (row.squiggleAt < 0 && Number(errorLine) === n && errorColumn) {
        row.squiggleAt = Math.max(0, Number(errorColumn) - 1);
        row.error = true;
      }
      html += '<div class="vista-error-editor-line' + (row.error ? ' is-error' : '') + '">';
      html += '<span class="vista-error-gutter">' + row.n + '</span>';
      html += '<span class="vista-error-source">' + highlightSource(row.text);
      if (row.squiggleAt >= 0) {
        html += '<span class="vista-error-squiggle" style="width:3.2ch;margin-left:' + row.squiggleAt + 'ch"></span>';
      }
      html += '</span></div>';
    }
    return '<div class="vista-error-editor">' + html + '</div>';
  }

  function colorizeBlock(value) {
    return renderIdeCode(value);
  }

  function createStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#' + ROOT_ID + '{position:fixed;inset:0;z-index:2147482500;display:flex;align-items:center;justify-content:center;padding:20px;overflow:hidden;}',
      '#' + ROOT_ID + '[hidden]{display:none;}',
      '#' + ROOT_ID + ' .vista-ov-backdrop{position:absolute;inset:0;background:rgba(0,0,0,0.72);}',
      '#' + ROOT_ID + ' .vista-ov-panel{position:relative;width:min(1180px,calc(100vw - 32px));height:min(820px,calc(100vh - 32px));display:flex;flex-direction:column;overflow:hidden;border-radius:8px;border:1px solid #2b2b2b;background:#1e1e1e;box-shadow:0 24px 80px rgba(0,0,0,0.62);color:#ededed;font-family:"Segoe UI",ui-sans-serif,system-ui,-apple-system,sans-serif;animation:vista-ov-in 160ms ease;}',
      '#' + ROOT_ID + ' .vista-ov-titlebar{display:flex;align-items:center;justify-content:space-between;gap:12px;height:38px;padding:0 10px;background:#181818;border-bottom:1px solid #2b2b2b;flex-shrink:0;}',
      '#' + ROOT_ID + ' .vista-ov-traffic{display:inline-flex;align-items:center;gap:6px;width:54px;}',
      '#' + ROOT_ID + ' .vista-ov-traffic span{width:10px;height:10px;border-radius:999px;}',
      '#' + ROOT_ID + ' .vista-ov-traffic .is-close{background:#ff5f57;}',
      '#' + ROOT_ID + ' .vista-ov-traffic .is-min{background:#febc2e;}',
      '#' + ROOT_ID + ' .vista-ov-traffic .is-max{background:#28c840;}',
      '#' + ROOT_ID + ' .vista-ov-window-title{min-width:0;flex:1;text-align:center;color:#c6c6c6;font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '#' + ROOT_ID + ' .vista-ov-pagination{display:inline-flex;align-items:center;gap:2px;}',
      '#' + ROOT_ID + ' .vista-ov-pagination[hidden]{display:none;}',
      '#' + ROOT_ID + ' .vista-ov-page-btn{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:6px;background:transparent;color:#a1a1a1;font-size:16px;line-height:1;cursor:pointer;}',
      '#' + ROOT_ID + ' .vista-ov-page-btn:disabled{opacity:0.28;cursor:default;}',
      '#' + ROOT_ID + ' .vista-ov-page-btn:not(:disabled):hover{background:#171717;color:#ededed;}',
      '#' + ROOT_ID + ' .vista-ov-page-count{font-size:13px;font-weight:500;color:#a1a1a1;min-width:36px;text-align:center;font-variant-numeric:tabular-nums;padding:0 4px;}',
      '#' + ROOT_ID + ' .vista-ov-workbench{display:flex;flex:1;min-height:0;}',
      '#' + ROOT_ID + ' .vista-ov-activity{width:48px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;padding-top:8px;background:#181818;border-right:1px solid #2b2b2b;}',
      '#' + ROOT_ID + ' .vista-ov-activity-item{width:48px;height:40px;display:inline-flex;align-items:center;justify-content:center;color:#ffffff;box-shadow:inset 2px 0 0 #0078d4;}',
      '#' + ROOT_ID + ' .vista-ov-activity-item svg{width:22px;height:22px;display:block;}',
      '#' + ROOT_ID + ' .vista-ov-main{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;}',
      '#' + ROOT_ID + ' .vista-ov-tabbar{display:flex;align-items:stretch;justify-content:space-between;height:35px;background:#181818;border-bottom:1px solid #2b2b2b;flex-shrink:0;}',
      '#' + ROOT_ID + ' .vista-ov-tabs{display:flex;min-width:0;overflow:hidden;scrollbar-width:none;}',
      '#' + ROOT_ID + ' .vista-ov-tabs::-webkit-scrollbar{display:none;}',
      '#' + ROOT_ID + ' .vista-ov-tab{display:inline-flex;align-items:center;gap:8px;height:35px;padding:0 14px;border:0;border-right:1px solid #2b2b2b;background:#1e1e1e;color:#cccccc;font-size:12px;box-shadow:inset 0 -1px 0 #0078d4;cursor:pointer;}',
      '#' + ROOT_ID + ' .vista-ov-tab.is-inactive{background:#181818;color:#8b8b8b;box-shadow:none;}',
      '#' + ROOT_ID + ' .vista-ov-tab svg{width:14px;height:14px;}',
      '#' + ROOT_ID + ' .vista-ov-actions{display:inline-flex;gap:2px;align-items:center;}',
      '#' + ROOT_ID + ' .vista-ov-btn{width:28px;height:28px;padding:0;border:0;border-radius:6px;background:transparent;color:#a1a1a1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;}',
      '#' + ROOT_ID + ' .vista-ov-btn:hover{background:#171717;color:#ededed;}',
      '#' + ROOT_ID + ' .vista-ov-btn svg{width:14px;height:14px;display:block;}',
      '#' + ROOT_ID + ' .vista-ov-btn:focus-visible{outline:2px solid #ededed;outline-offset:1px;}',
      '#' + ROOT_ID + ' .vista-ov-crumbs{height:24px;padding:0 12px;display:flex;align-items:center;background:#1e1e1e;border-bottom:1px solid #2b2b2b;color:#8b8b8b;font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '#' + ROOT_ID + ' .vista-ov-code{display:flex;flex-direction:column;flex:1;min-height:0;background:#1e1e1e;overflow:hidden;}',
      '#' + ROOT_ID + ' .vista-ov-code[hidden]{display:none;}',
      '#' + ROOT_ID + ' .vista-ov-editor-host{flex:1;min-height:0;overflow:auto;}',
      '#' + ROOT_ID + ' .vista-error-editor{margin:0;min-height:100%;padding:8px 0 12px;font-size:13px;line-height:20px;font-family:ui-monospace,SFMono-Regular,"Cascadia Code",Menlo,Consolas,monospace;background:#1e1e1e;}',
      '#' + ROOT_ID + ' .vista-error-editor-line{display:grid;grid-template-columns:56px minmax(0,1fr);min-height:20px;}',
      '#' + ROOT_ID + ' .vista-error-editor-line.is-error{background:rgba(248,81,73,0.12);}',
      '#' + ROOT_ID + ' .vista-error-gutter{padding:0 12px 0 0;border-right:1px solid #2b2b2b;color:#6e7681;text-align:right;user-select:none;font-variant-numeric:tabular-nums;}',
      '#' + ROOT_ID + ' .vista-error-editor-line.is-error .vista-error-gutter{color:#f85149;font-weight:600;}',
      '#' + ROOT_ID + ' .vista-error-source{position:relative;padding:0 16px 0 12px;color:#d4d4d4;white-space:pre;overflow:hidden;}',
      '#' + ROOT_ID + ' .vista-error-squiggle{position:absolute;left:12px;bottom:0;height:4px;width:3.2ch;background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'6\' height=\'4\' viewBox=\'0 0 6 4\'%3E%3Cpath d=\'M0 3 Q1.5 0 3 3 T6 3\' fill=\'none\' stroke=\'%23f85149\' stroke-width=\'1.4\'/%3E%3C/svg%3E");background-repeat:repeat-x;background-size:6px 4px;pointer-events:none;}',
      '#' + ROOT_ID + ' .vista-tok-kw{color:#c586c0;}',
      '#' + ROOT_ID + ' .vista-tok-str{color:#ce9178;}',
      '#' + ROOT_ID + ' .vista-tok-cmt{color:#6a9955;font-style:italic;}',
      '#' + ROOT_ID + ' .vista-tok-tag{color:#4ec9b0;}',
      '#' + ROOT_ID + ' .vista-tok-num{color:#b5cea8;}',
      '#' + ROOT_ID + ' .vista-ov-statusbar{display:flex;align-items:center;justify-content:space-between;gap:12px;height:22px;padding:0 10px;background:#007acc;color:#fff;font-size:12px;flex-shrink:0;}',
      '#' + ROOT_ID + ' .vista-ov-panel-dock{display:flex;flex-direction:column;background:#181818;border-top:1px solid #2b2b2b;overflow:hidden;flex:0 0 auto;max-height:38%;min-height:148px;}',
      '#' + ROOT_ID + ' .vista-ov-panel-tabs{display:flex;align-items:center;gap:16px;height:32px;padding:0 8px 0 12px;border-bottom:1px solid #2b2b2b;color:#bbbbbb;font-size:11px;font-weight:600;letter-spacing:0.06em;flex-shrink:0;}',
      '#' + ROOT_ID + ' .vista-ov-panel-tabs .is-active{color:#fff;box-shadow:inset 0 -1px 0 #fff;padding-bottom:8px;}',
      '#' + ROOT_ID + ' .vista-ov-panel-toggle{margin-left:auto;}',
      '#' + ROOT_ID + ' .vista-ov-panel-toggle[hidden]{display:none;}',
      '#' + ROOT_ID + ' .vista-ov-panel-toggle .vista-ide-icon-restore{display:none;}',
      '#' + ROOT_ID + ' .vista-ov-main[data-panel-expanded="true"] .vista-ov-tabbar,' +
        '#' + ROOT_ID + ' .vista-ov-main[data-panel-expanded="true"] .vista-ov-crumbs,' +
        '#' + ROOT_ID + ' .vista-ov-main[data-panel-expanded="true"] .vista-ov-code,' +
        '#' + ROOT_ID + ' .vista-ov-main[data-panel-expanded="true"] .vista-ov-statusbar{display:none;}',
      '#' + ROOT_ID + ' .vista-ov-main[data-panel-expanded="true"] .vista-ov-panel-dock{flex:1;max-height:none;min-height:0;border-top:0;}',
      '#' + ROOT_ID + ' .vista-ov-main[data-panel-expanded="true"] .vista-ide-icon-expand{display:none;}',
      '#' + ROOT_ID + ' .vista-ov-main[data-panel-expanded="true"] .vista-ide-icon-restore{display:block;}',
      '#' + ROOT_ID + ' .vista-ov-main[data-terminal="true"] .vista-ov-tabbar,' +
        '#' + ROOT_ID + ' .vista-ov-main[data-terminal="true"] .vista-ov-crumbs,' +
        '#' + ROOT_ID + ' .vista-ov-main[data-terminal="true"] .vista-ov-code,' +
        '#' + ROOT_ID + ' .vista-ov-main[data-terminal="true"] .vista-ov-statusbar{display:none;}',
      '#' + ROOT_ID + ' .vista-ov-main[data-terminal="true"] .vista-ov-panel-dock{flex:1;max-height:none;min-height:0;border-top:0;}',
      '#' + ROOT_ID + ' .vista-ov-main[data-terminal="true"] .vista-ov-panel-toggle{display:none;}',
      '#' + ROOT_ID + ' .vista-ov-body{flex:1;min-height:0;overflow:auto;padding:10px 14px 14px;}',
      '#' + ROOT_ID + ' .vista-ov-editor-host,' + '#' + ROOT_ID + ' .vista-ov-body{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.16) transparent;}',
      '#' + ROOT_ID + ' .vista-ov-editor-host::-webkit-scrollbar,' + '#' + ROOT_ID + ' .vista-ov-body::-webkit-scrollbar{width:6px;height:6px;}',
      '#' + ROOT_ID + ' .vista-ov-editor-host::-webkit-scrollbar-track,' + '#' + ROOT_ID + ' .vista-ov-body::-webkit-scrollbar-track,' +
        '#' + ROOT_ID + ' .vista-ov-editor-host::-webkit-scrollbar-corner,' + '#' + ROOT_ID + ' .vista-ov-body::-webkit-scrollbar-corner{background:transparent;}',
      '#' + ROOT_ID + ' .vista-ov-editor-host::-webkit-scrollbar-thumb,' + '#' + ROOT_ID + ' .vista-ov-body::-webkit-scrollbar-thumb{background-color:rgba(255,255,255,0.16);border-radius:999px;}',
      '#' + ROOT_ID + ' .vista-ov-editor-host::-webkit-scrollbar-thumb:hover,' + '#' + ROOT_ID + ' .vista-ov-body::-webkit-scrollbar-thumb:hover{background-color:rgba(255,255,255,0.34);}',
      '#' + ROOT_ID + ' .vista-ov-kind{margin:0;color:#f85149;font-size:12px;font-weight:600;}',
      '#' + ROOT_ID + ' .vista-ov-kind.is-hydration{color:#d29922;}',
      '#' + ROOT_ID + ' .vista-ov-kind.is-server{color:#58a6ff;}',
      '#' + ROOT_ID + ' .vista-ov-source-badge{padding:0 7px;border-radius:999px;font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;background:rgba(255,255,255,0.12);}',
      '#' + ROOT_ID + ' .vista-ov-source-badge.is-server{background:#1f6feb;}',
      '#' + ROOT_ID + ' .vista-ov-source-badge.is-hydration{background:#9e6a03;}',
      '#' + ROOT_ID + ' .vista-ov-source-badge.is-client{background:#238636;}',
      '#' + ROOT_ID + ' .vista-ov-title{margin:6px 0 0;font-size:13px;line-height:1.5;font-weight:500;color:#e6edf3;word-break:break-word;}',
      '#' + ROOT_ID + ' .vista-ov-detail{margin:6px 0 0;font-size:12px;line-height:1.5;color:#8b949e;white-space:pre-wrap;word-break:break-word;}',
      '#' + ROOT_ID + ' .vista-ov-detail[hidden]{display:none;}',
      '@keyframes vista-ov-in{from{opacity:0;transform:translateY(8px) scale(0.98);}to{opacity:1;transform:translateY(0) scale(1);}}',
      '@media (max-width: 720px){',
      '  #' + ROOT_ID + '{padding:10px;}',
      '}',
    ].join('');
    document.head.appendChild(style);
  }

  function ensureMounted() {
    createStyle();
    if (!root) {
      root = document.getElementById(ROOT_ID);
    }
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      root.hidden = true;
      root.innerHTML = [
        '<div class="vista-ov-backdrop"></div>',
        '<section class="vista-ov-panel" role="dialog" aria-modal="true" aria-label="Vista build error overlay">',
        '  <div class="vista-ov-titlebar">',
        '    <div class="vista-ov-traffic" aria-hidden="true"><span class="is-close"></span><span class="is-min"></span><span class="is-max"></span></div>',
        '    <div class="vista-ov-window-title">Vista — <span data-vista-tab-name>untitled</span></div>',
        '    <div class="vista-ov-actions">',
        '      <button type="button" class="vista-ov-btn" data-vista-copy aria-label="Copy error">',
        '        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.6"/><rect x="5" y="5" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.6"/></svg>',
        '      </button>',
        '      <button type="button" class="vista-ov-btn" data-vista-minimize aria-label="Minimize">',
        '        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M5 12H19" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
        '      </button>',
        '      <button type="button" class="vista-ov-btn" data-vista-reload aria-label="Reload">',
        '        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M20 11A8 8 0 1 0 12 20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M20 4V11H13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        '      </button>',
        '      <div class="vista-ov-pagination" data-vista-pagination hidden>',
        '        <button type="button" class="vista-ov-page-btn" data-vista-prev aria-label="Previous error">‹</button>',
        '        <span class="vista-ov-page-count" data-vista-count>1/1</span>',
        '        <button type="button" class="vista-ov-page-btn" data-vista-next aria-label="Next error">›</button>',
        '      </div>',
        '    </div>',
        '  </div>',
        '  <div class="vista-ov-workbench">',
        '    <aside class="vista-ov-activity" aria-hidden="true"><span class="vista-ov-activity-item"><svg viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="10" height="13" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="10" y="8" width="10" height="13" rx="1.2" stroke="currentColor" stroke-width="1.6"/></svg></span></aside>',
        '    <div class="vista-ov-main" data-vista-ide-main>',
        '      <div class="vista-ov-tabbar">',
        '        <div class="vista-ov-tabs" data-vista-file-tabs><button type="button" class="vista-ov-tab" data-vista-file-tab="0"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="2" width="10" height="12" rx="1.5" stroke="#4fc1ff" stroke-width="1.4"/><path d="M6 6h4M6 9h4M6 12h2" stroke="#4fc1ff" stroke-width="1.2" stroke-linecap="round"/></svg><span data-vista-tab-name>untitled</span></button></div>',
        '      </div>',
        '      <div class="vista-ov-crumbs" data-vista-crumbs>Source</div>',
        '      <div class="vista-ov-code" data-vista-files-wrap>',
        '        <div class="vista-ov-editor-host" data-vista-message></div>',
        '      </div>',
        '      <div class="vista-ov-statusbar"><span data-vista-status-ln>Ready</span><span data-vista-status-lang>Plain Text</span><span class="vista-ov-source-badge" data-vista-source-badge>Build</span><span>UTF-8</span></div>',
        '      <div class="vista-ov-panel-dock">',
        '        <div class="vista-ov-panel-tabs"><span class="is-active">PROBLEMS</span><span>OUTPUT</span><button type="button" class="vista-ov-btn vista-ov-panel-toggle" data-vista-panel-expand aria-label="Expand problems panel" aria-pressed="false"><svg class="vista-ide-icon-expand" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 6.5V3h3.5M13 6.5V3h-3.5M3 9.5V13h3.5M13 9.5V13h-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg><svg class="vista-ide-icon-restore" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6.5 3v3.5H3M9.5 3v3.5H13M6.5 13V9.5H3M9.5 13V9.5H13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>',
        '        <div class="vista-ov-body">',
        '          <p class="vista-ov-kind" data-vista-ov-kind>Build Error</p>',
        '          <h1 class="vista-ov-title" data-vista-ov-title>Build Error</h1>',
        '          <p class="vista-ov-detail" data-vista-ov-detail hidden></p>',
        '        </div>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</section>',
      ].join('');
      document.body.appendChild(root);
    } else if (!root.isConnected && document.body) {
      document.body.appendChild(root);
    }

    var backdrop = root.querySelector('.vista-ov-backdrop');
    messageNode = root.querySelector('[data-vista-message]');
    titleNode = root.querySelector('[data-vista-ov-title]');
    detailNode = root.querySelector('[data-vista-ov-detail]');
    filesWrapNode = root.querySelector('[data-vista-files-wrap]');
    tabNameNodes = root.querySelectorAll('[data-vista-tab-name]');
    crumbsNode = root.querySelector('[data-vista-crumbs]');
    statusLnNode = root.querySelector('[data-vista-status-ln]');
    statusLangNode = root.querySelector('[data-vista-status-lang]');
    kindNode = root.querySelector('[data-vista-ov-kind]');
    sourceBadgeNode = root.querySelector('[data-vista-source-badge]');
    fileTabsNode = root.querySelector('[data-vista-file-tabs]');
    copyButton = root.querySelector('[data-vista-copy]');
    minimizeButton = root.querySelector('[data-vista-minimize]');
    reloadButton = root.querySelector('[data-vista-reload]');
    paginationNode = root.querySelector('[data-vista-pagination]');
    prevButton = root.querySelector('[data-vista-prev]');
    nextButton = root.querySelector('[data-vista-next]');
    countNode = root.querySelector('[data-vista-count]');
    mainNode = root.querySelector('[data-vista-ide-main]');
    panelExpandButton = root.querySelector('[data-vista-panel-expand]');

    if (listenersBound) return;
    listenersBound = true;

    if (fileTabsNode) {
      fileTabsNode.addEventListener('click', function (event) {
        var target = event.target && event.target.closest ? event.target.closest('[data-vista-file-tab]') : null;
        if (!target) return;
        state.fileTab = Number(target.getAttribute('data-vista-file-tab') || 0);
        renderCurrent();
      });
    }
    if (copyButton) {
      copyButton.addEventListener('click', function () {
        copyCurrentMessage();
      });
    }
    if (minimizeButton) {
      minimizeButton.addEventListener('click', function () {
        minimize();
      });
    }
    if (reloadButton) {
      reloadButton.addEventListener('click', function () {
        reloadPage();
      });
    }
    if (prevButton) {
      prevButton.addEventListener('click', function () {
        moveActiveIndex(-1);
      });
    }
    if (nextButton) {
      nextButton.addEventListener('click', function () {
        moveActiveIndex(1);
      });
    }
    if (panelExpandButton && mainNode) {
      panelExpandButton.addEventListener('click', function () {
        if (mainNode.getAttribute('data-terminal') === 'true') return;
        var expanded = mainNode.getAttribute('data-panel-expanded') === 'true';
        if (expanded) {
          mainNode.removeAttribute('data-panel-expanded');
          panelExpandButton.setAttribute('aria-pressed', 'false');
          panelExpandButton.setAttribute('aria-label', 'Expand problems panel');
        } else {
          mainNode.setAttribute('data-panel-expanded', 'true');
          panelExpandButton.setAttribute('aria-pressed', 'true');
          panelExpandButton.setAttribute('aria-label', 'Restore problems panel');
        }
      });
    }
    if (backdrop) {
      backdrop.addEventListener('click', function () {
        minimize();
      });
    }
    if (root) {
      root.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowLeft') {
          moveActiveIndex(-1);
        } else if (event.key === 'ArrowRight') {
          moveActiveIndex(1);
        } else         if (event.key === 'Escape') {
          if (mainNode && mainNode.getAttribute('data-panel-expanded') === 'true' && mainNode.getAttribute('data-terminal') !== 'true') {
            mainNode.removeAttribute('data-panel-expanded');
            if (panelExpandButton) {
              panelExpandButton.setAttribute('aria-pressed', 'false');
              panelExpandButton.setAttribute('aria-label', 'Expand problems panel');
            }
            return;
          }
          minimize();
        }
      });
    }
  }

  function normalizeMessages(input) {
    if (Array.isArray(input)) {
      return input
        .map(function (entry) {
          return typeof entry === 'string' ? entry : String(entry || '');
        })
        .filter(function (entry) {
          return entry.trim().length > 0;
        });
    }

    if (input && typeof input === 'object' && Array.isArray(input.errors)) {
      return normalizeMessages(input.errors);
    }

    var raw = typeof input === 'string' ? input : String(input || '');
    if (raw.trim().length === 0) {
      return [];
    }

    var splitByWebpack = raw.split(/\n(?=ERROR in\s)/g).filter(function (entry) {
      return entry.trim().length > 0;
    });
    if (splitByWebpack.length > 1) {
      return splitByWebpack;
    }
    return [raw];
  }

  function parseMessage(input) {
    var raw = typeof input === 'string' ? input : String(input || 'Unknown build error.');
    var lines = raw.split(/\r?\n/);
    var trimmedLines = [];
    for (var i = 0; i < lines.length; i += 1) {
      var entry = lines[i] ? lines[i].trim() : '';
      if (entry.length > 0) {
        trimmedLines.push(entry);
      }
    }

    var title = trimmedLines.length ? trimmedLines[0] : 'Build Error';
    if (title.length > 140) {
      title = title.slice(0, 137) + '...';
    }

    var files = [];
    var filePattern = /(?:[A-Za-z]:)?[\\/\w.@-]+\.(?:tsx?|jsx?|mjs|cjs|css|json|mdx?)(?::\d+(?::\d+)?)?/;
    for (var fileIdx = 0; fileIdx < lines.length; fileIdx += 1) {
      var maybeFile = lines[fileIdx].match(filePattern);
      if (!maybeFile) continue;
      var normalized = maybeFile[0].replace(/\\/g, '/').replace(/^\.\//, '');
      if (files.indexOf(normalized) === -1) {
        files.push(normalized);
      }
      if (files.length >= 5) break;
    }

    var hints = [];
    if (/['"]use client['"]/.test(raw)) {
      hints.push("Client hook detected in a Server Component. Add 'use client' to the top of that file.");
    }
    if (/Cannot find module/i.test(raw) || /Module not found/i.test(raw)) {
      hints.push('A module import failed to resolve. Check the import path or install the missing package.');
    }
    if (/Unexpected token/i.test(raw) || /SyntaxError/i.test(raw)) {
      hints.push('A syntax issue is blocking compilation. Start from the first highlighted file and fix parsing errors.');
    }
    if (/Type error/i.test(raw) || /TS\d{3,5}/i.test(raw)) {
      hints.push('TypeScript validation failed. Fix the first type error first to reduce cascading issues.');
    }
    if (/Structure Validation Failed/i.test(raw)) {
      hints.push('App structure rules failed. Verify route files, layout/page naming, and required conventions.');
    }
    if (hints.length === 0 && files.length > 0) {
      hints.push('Start with the first file above, then re-run after each fix.');
    }
    if (hints.length === 0) {
      hints.push('Resolve the top-most failure first, then reload to see remaining issues.');
    }

    var kind = 'build';
    if (/hydration/i.test(title) || /hydration|did not match|server rendered html/i.test(raw)) {
      kind = 'hydration';
    } else if (/server error|flight ssr/i.test(title + ' ' + raw)) {
      kind = 'server';
    } else if (/runtime|unhandled promise/i.test(title)) {
      kind = 'runtime';
    }

    return {
      raw: raw,
      title: title,
      files: files,
      hints: hints,
      kind: kind,
      timestamp: new Date(),
    };
  }

  function fillList(node, values, wrapNode) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
    if (!values || values.length === 0) {
      if (wrapNode) wrapNode.hidden = false;
      return;
    }
    for (var i = 0; i < values.length; i += 1) {
      var item = document.createElement('li');
      item.textContent = values[i];
      node.appendChild(item);
    }
    if (wrapNode) wrapNode.hidden = false;
  }

  function currentEntry() {
    if (!state.entries || state.entries.length === 0) return null;
    var index = state.activeIndex;
    if (index < 0) index = 0;
    if (index > state.entries.length - 1) index = state.entries.length - 1;
    return state.entries[index];
  }

  function updatePagination() {
    var total = state.entries.length;
    var current = total === 0 ? 0 : state.activeIndex + 1;
    if (countNode) {
      countNode.textContent = current + '/' + (total || 1);
    }
    if (paginationNode) {
      paginationNode.hidden = total <= 1;
    }
    if (prevButton) {
      prevButton.disabled = state.activeIndex <= 0;
    }
    if (nextButton) {
      nextButton.disabled = state.activeIndex >= total - 1;
    }
  }

  function entryHasCode(parsed) {
    if (!parsed) return false;
    if (parsed.kind === 'server' || parsed.kind === 'hydration') return false;
    return /(\s*>)?\s*\d+\s+\|/.test(String(parsed.raw || ''));
  }

  function renderCurrent() {
    var parsed = currentEntry();
    if (!parsed || !root) return;
    var files = parsed.files && parsed.files.length ? parsed.files : [''];
    if (state.fileTab > files.length - 1) state.fileTab = 0;
    var file = files[state.fileTab] || files[0] || '';
    var loc = parseFileLocation(file);
    var tabName = fileBasename(file);
    var kind = parsed.kind || 'build';
    var kindLabel = kind === 'hydration' ? 'Hydration Error' : kind === 'server' ? 'Server Error' : kind === 'runtime' ? 'Unhandled Runtime Error' : 'Build Error';
    var badge = kind === 'hydration' ? 'Hydration' : kind === 'server' ? 'Server' : kind === 'runtime' ? 'Client' : 'Build';
    var terminal = !entryHasCode(parsed);
    var titleName = terminal ? kindLabel : tabName;
    if (kindNode) {
      kindNode.textContent = kindLabel;
      kindNode.className = 'vista-ov-kind' + (kind === 'hydration' || kind === 'server' ? ' is-' + kind : '');
    }
    if (titleNode) titleNode.textContent = parsed.title || 'Build Error';
    if (detailNode) {
      var hintText = (parsed.hints || []).join(' ');
      if (kind === 'hydration' && hintText.indexOf('HTML') === -1) {
        hintText = 'Server HTML did not match the client. ' + hintText;
      }
      detailNode.textContent = hintText;
      detailNode.hidden = hintText.length === 0;
    }
    if (fileTabsNode) {
      var tabs = '';
      for (var i = 0; i < files.length; i += 1) {
        var name = fileBasename(files[i] || 'untitled');
        tabs += '<button type="button" class="vista-ov-tab' + (i === state.fileTab ? '' : ' is-inactive') + '" data-vista-file-tab="' + i + '">';
        tabs += '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="2" width="10" height="12" rx="1.5" stroke="#4fc1ff" stroke-width="1.4"/><path d="M6 6h4M6 9h4M6 12h2" stroke="#4fc1ff" stroke-width="1.2" stroke-linecap="round"/></svg>';
        tabs += '<span>' + escapeHtml(name) + '</span></button>';
      }
      fileTabsNode.innerHTML = tabs;
    }
    if (tabNameNodes) {
      for (var t = 0; t < tabNameNodes.length; t += 1) {
        if (tabNameNodes[t].closest && tabNameNodes[t].closest('[data-vista-file-tabs]')) continue;
        tabNameNodes[t].textContent = titleName;
      }
    }
    if (crumbsNode) crumbsNode.textContent = fileBreadcrumb(file);
    if (statusLnNode) statusLnNode.textContent = loc.line ? ('Ln ' + loc.line + ', Col ' + loc.column) : 'Ready';
    if (statusLangNode) statusLangNode.textContent = languageFromFile(file);
    if (sourceBadgeNode) {
      sourceBadgeNode.textContent = badge;
      sourceBadgeNode.className = 'vista-ov-source-badge' + (kind === 'build' ? '' : ' is-' + (kind === 'runtime' ? 'client' : kind));
    }
    if (messageNode) messageNode.innerHTML = renderIdeCode(parsed.raw, loc.line, loc.column);
    if (filesWrapNode) filesWrapNode.hidden = false;
    if (mainNode) {
      if (terminal) {
        mainNode.setAttribute('data-terminal', 'true');
        mainNode.removeAttribute('data-panel-expanded');
      } else {
        mainNode.removeAttribute('data-terminal');
      }
    }
    if (panelExpandButton) {
      panelExpandButton.hidden = terminal;
      if (terminal) {
        panelExpandButton.setAttribute('aria-pressed', 'false');
        panelExpandButton.setAttribute('aria-label', 'Expand problems panel');
      }
    }
    updatePagination();
  }

  function moveActiveIndex(offset) {
    if (!state.entries || state.entries.length <= 1) return;
    var next = state.activeIndex + offset;
    if (next < 0 || next >= state.entries.length) return;
    state.activeIndex = next;
    state.fileTab = 0;
    renderCurrent();
  }

  function copyCurrentMessage() {
    var entry = currentEntry();
    if (!entry) return;
    var text = entry.raw;
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {});
      return;
    }
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
    } catch (e) {}
    document.body.removeChild(textarea);
  }

  function reloadPage() {
    if (typeof window === 'undefined') return;
    window.location.reload();
  }

  function openFromState() {
    ensureMounted();
    if (!state.entries || state.entries.length === 0) return false;
    state.open = true;
    state.minimized = false;
    renderCurrent();
    if (root) root.hidden = false;
    var indicator = getIndicator();
    if (indicator && typeof indicator.clearError === 'function') {
      indicator.clearError();
    }
    return true;
  }

  function show(input) {
    ensureMounted();
    var messages = normalizeMessages(input);
    if (messages.length === 0) {
      return;
    }
    state.entries = messages.map(function (message) {
      return parseMessage(message);
    });
    state.activeIndex = 0;
    openFromState();
  }

  function capture(input) {
    ensureMounted();
    var messages = normalizeMessages(input);
    if (messages.length === 0) {
      return;
    }
    state.entries = messages.map(function (message) {
      return parseMessage(message);
    });
    state.activeIndex = 0;
    state.open = false;
    state.minimized = true;
    if (root) root.hidden = true;
    var entry = currentEntry();
    var indicator = getIndicator();
    if (indicator && typeof indicator.setError === 'function') {
      indicator.setError(entry ? entry.title || 'Build error' : 'Build error', state.entries.length);
    }
  }

  function minimize() {
    var entry = currentEntry();
    if (!entry) return false;
    ensureMounted();
    state.open = false;
    state.minimized = true;
    if (root) root.hidden = true;
    var indicator = getIndicator();
    if (indicator && typeof indicator.setError === 'function') {
      indicator.setError(entry.title || 'Build error', state.entries.length);
    }
    return true;
  }

  function clear() {
    state.open = false;
    state.minimized = false;
    state.entries = [];
    state.activeIndex = 0;
    if (root) root.hidden = true;
    var indicator = getIndicator();
    if (indicator && typeof indicator.clearError === 'function') {
      indicator.clearError();
    }
  }

  function restoreFromIndicator() {
    if (!state.minimized || !state.entries || state.entries.length === 0) return false;
    return openFromState();
  }

  window.__VISTA_DEV_ERROR_OVERLAY__ = {
    show: show,
    capture: capture,
    minimize: minimize,
    clear: clear,
    restoreFromIndicator: restoreFromIndicator,
    isOpen: function () {
      return state.open;
    },
    hasError: function () {
      return state.entries && state.entries.length > 0;
    },
  };
})();
`;
}
