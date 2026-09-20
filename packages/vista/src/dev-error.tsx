/**
 * Vista Error Overlay
 *
 * Standalone dev error UI with Next.js-style pagination and controls.
 */

import React from 'react';
import { SSE_ENDPOINT } from './constants';

// ============================================================================
// Types
// ============================================================================

export interface VistaErrorLocation {
  file: string;
  line?: number;
  column?: number;
  codeFrame?: string;
  kind?: 'source' | 'server' | 'client' | 'log';
}

export interface VistaError {
  type: 'build' | 'runtime' | 'hydration';
  source?: 'server' | 'client';
  message: string;
  stack?: string;
  file?: string;
  line?: number;
  column?: number;
  codeFrame?: string;
  related?: VistaErrorLocation[];
  hint?: string;
}

interface ErrorOverlayProps {
  errors: VistaError[];
}

// ============================================================================
// Styles + runtime helpers
// ============================================================================

const OVERLAY_STYLES = `
* { box-sizing: border-box; }
html, body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  background: #050505;
  color: #ededed;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
body { line-height: 1.5; }
.vista-error-page-root {
  min-height: 100vh;
  height: 100vh;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow: hidden;
}
.vista-error-page-root[data-embedded='true'] {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
}
.vista-error-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
}
.vista-error-panel {
  position: relative;
  width: min(1180px, calc(100vw - 32px));
  height: min(820px, calc(100vh - 32px));
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  overflow: hidden;
  background: #1e1e1e;
  border: 1px solid #2b2b2b;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.62);
  animation: vista-overlay-in 160ms ease;
}
.vista-ide-workbench {
  display: flex;
  flex: 1;
  min-height: 0;
}
.vista-ide-activity {
  width: 48px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 8px;
  background: #181818;
  border-right: 1px solid #2b2b2b;
}
.vista-ide-activity-item {
  width: 48px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #858585;
}
.vista-ide-activity-item.is-active {
  color: #ffffff;
  box-shadow: inset 2px 0 0 #0078d4;
}
.vista-ide-activity-item svg {
  width: 22px;
  height: 22px;
  display: block;
}
.vista-ide-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.vista-ide-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 38px;
  padding: 0 10px;
  background: #181818;
  border-bottom: 1px solid #2b2b2b;
  flex-shrink: 0;
}
.vista-ide-traffic {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 54px;
}
.vista-ide-traffic span {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}
.vista-ide-traffic .is-close { background: #ff5f57; }
.vista-ide-traffic .is-min { background: #febc2e; }
.vista-ide-traffic .is-max { background: #28c840; }
.vista-ide-title {
  min-width: 0;
  flex: 1;
  text-align: center;
  color: #c6c6c6;
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vista-error-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.vista-ide-tabbar {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  height: 35px;
  background: #181818;
  border-bottom: 1px solid #2b2b2b;
  flex-shrink: 0;
}
.vista-ide-tabs {
  display: flex;
  min-width: 0;
  overflow: hidden;
  scrollbar-width: none;
}
.vista-ide-tabs::-webkit-scrollbar { display: none; }
.vista-ide-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 35px;
  padding: 0 14px;
  border: 0;
  border-right: 1px solid #2b2b2b;
  background: #1e1e1e;
  color: #cccccc;
  font-size: 12px;
  cursor: pointer;
  box-shadow: inset 0 -1px 0 #0078d4;
}
.vista-ide-tab:hover { color: #fff; }
.vista-ide-tab.is-inactive {
  background: #181818;
  color: #8b8b8b;
  box-shadow: none;
}
.vista-ide-tab-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
.vista-ide-crumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 12px;
  background: #1e1e1e;
  border-bottom: 1px solid #2b2b2b;
  color: #8b8b8b;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vista-error-code {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: #1e1e1e;
  overflow: hidden;
}
.vista-error-editor-host {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.vista-error-editor {
  margin: 0;
  min-height: 100%;
  padding: 8px 0 12px;
  overflow: visible;
  font-size: 13px;
  line-height: 20px;
  font-family: ui-monospace, SFMono-Regular, "Cascadia Code", Menlo, Consolas, monospace;
  background: #1e1e1e;
}
.vista-error-editor-line {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  min-height: 20px;
}
.vista-error-editor-line.is-error {
  background: rgba(248, 81, 73, 0.12);
}
.vista-error-editor-line.is-server {
  background: rgba(248, 81, 73, 0.1);
}
.vista-error-editor-line.is-client {
  background: rgba(63, 185, 80, 0.1);
}
.vista-ide-source-badge {
  padding: 0 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: rgba(255, 255, 255, 0.12);
}
.vista-ide-source-badge.is-server { background: #1f6feb; }
.vista-ide-source-badge.is-client { background: #238636; }
.vista-ide-source-badge.is-hydration { background: #9e6a03; }
.vista-error-hint {
  margin: 8px 0 0;
  color: #8b949e;
  font-size: 12px;
  line-height: 1.5;
}
.vista-error-hint[hidden] { display: none; }
.vista-error-problem-icon.is-hydration { background: #d29922; }
.vista-error-problem-icon.is-server { background: #58a6ff; }
.vista-error-kind.is-hydration { color: #d29922; }
.vista-error-kind.is-server { color: #58a6ff; }
.vista-error-gutter {
  padding: 0 12px 0 0;
  border-right: 1px solid #2b2b2b;
  color: #6e7681;
  text-align: right;
  user-select: none;
  font-variant-numeric: tabular-nums;
}
.vista-error-editor-line.is-error .vista-error-gutter { color: #f85149; font-weight: 600; }
.vista-error-source {
  position: relative;
  padding: 0 16px 0 12px;
  color: #d4d4d4;
  white-space: pre;
  overflow: hidden;
}
.vista-error-squiggle {
  position: absolute;
  left: 12px;
  bottom: 0;
  height: 4px;
  width: 3.2ch;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='4' viewBox='0 0 6 4'%3E%3Cpath d='M0 3 Q1.5 0 3 3 T6 3' fill='none' stroke='%23f85149' stroke-width='1.4'/%3E%3C/svg%3E");
  background-repeat: repeat-x;
  background-size: 6px 4px;
  pointer-events: none;
}
.vista-tok-kw { color: #c586c0; }
.vista-tok-str { color: #ce9178; }
.vista-tok-cmt { color: #6a9955; font-style: italic; }
.vista-tok-tag { color: #4ec9b0; }
.vista-tok-num { color: #b5cea8; }
.vista-ide-statusbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 22px;
  padding: 0 10px;
  background: #007acc;
  color: #ffffff;
  font-size: 12px;
  flex-shrink: 0;
}
.vista-ide-statusbar span { white-space: nowrap; }
.vista-ide-panel {
  display: flex;
  flex-direction: column;
  background: #181818;
  border-top: 1px solid #2b2b2b;
  overflow: hidden;
  flex: 0 0 auto;
  max-height: 38%;
  min-height: 148px;
}
.vista-ide-panel-tabs {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 32px;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid #2b2b2b;
  color: #bbbbbb;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  flex-shrink: 0;
}
.vista-ide-panel-tabs .is-active {
  color: #ffffff;
  box-shadow: inset 0 -1px 0 #ffffff;
  padding-bottom: 8px;
}
.vista-ide-panel-toggle {
  margin-left: auto;
}
.vista-ide-panel-toggle[hidden] { display: none; }
.vista-ide-panel-toggle .vista-ide-icon-restore { display: none; }
.vista-ide-main[data-panel-expanded='true'] .vista-ide-tabbar,
.vista-ide-main[data-panel-expanded='true'] .vista-ide-crumbs,
.vista-ide-main[data-panel-expanded='true'] .vista-error-code,
.vista-ide-main[data-panel-expanded='true'] .vista-ide-statusbar {
  display: none;
}
.vista-ide-main[data-panel-expanded='true'] .vista-ide-panel {
  flex: 1;
  max-height: none;
  min-height: 0;
  border-top: 0;
}
.vista-ide-main[data-panel-expanded='true'] .vista-ide-icon-expand { display: none; }
.vista-ide-main[data-panel-expanded='true'] .vista-ide-icon-restore { display: block; }
.vista-ide-main[data-terminal='true'] .vista-ide-tabbar,
.vista-ide-main[data-terminal='true'] .vista-ide-crumbs,
.vista-ide-main[data-terminal='true'] .vista-error-code,
.vista-ide-main[data-terminal='true'] .vista-ide-statusbar {
  display: none;
}
.vista-ide-main[data-terminal='true'] .vista-ide-panel {
  flex: 1;
  max-height: none;
  min-height: 0;
  border-top: 0;
}
.vista-ide-main[data-terminal='true'] .vista-ide-panel-toggle { display: none; }
.vista-error-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 14px 14px;
}
.vista-error-editor-host,
.vista-error-body,
.vista-ide-panel {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.16) transparent;
}
.vista-error-editor-host::-webkit-scrollbar,
.vista-error-body::-webkit-scrollbar,
.vista-ide-panel::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.vista-error-editor-host::-webkit-scrollbar-track,
.vista-error-body::-webkit-scrollbar-track,
.vista-ide-panel::-webkit-scrollbar-track,
.vista-error-editor-host::-webkit-scrollbar-corner,
.vista-error-body::-webkit-scrollbar-corner,
.vista-ide-panel::-webkit-scrollbar-corner {
  background: transparent;
}
.vista-error-editor-host::-webkit-scrollbar-thumb,
.vista-error-body::-webkit-scrollbar-thumb,
.vista-ide-panel::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.16);
  border-radius: 999px;
}
.vista-error-editor-host::-webkit-scrollbar-thumb:hover,
.vista-error-body::-webkit-scrollbar-thumb:hover,
.vista-ide-panel::-webkit-scrollbar-thumb:hover {
  background-color: rgba(255, 255, 255, 0.34);
}
.vista-error-kind {
  margin: 0;
  color: #f85149;
  font-size: 12px;
  font-weight: 600;
}
.vista-error-headline {
  margin: 6px 0 0;
  color: #e6edf3;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
  word-break: break-word;
}
.vista-error-detail {
  margin: 6px 0 0;
  color: #8b949e;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.vista-error-problem {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 2px 4px;
}
.vista-error-problem-icon {
  width: 14px;
  height: 14px;
  margin-top: 2px;
  border-radius: 999px;
  background: #f85149;
  flex-shrink: 0;
}
.vista-error-detail[hidden],
.vista-error-code[hidden],
.vista-error-stack[hidden] { display: none; }
.vista-error-stack { margin-top: 8px; }
.vista-error-stack-title {
  margin: 0 0 6px;
  color: #bbbbbb;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
}
.vista-error-frames {
  display: flex;
  flex-direction: column;
}
.vista-error-frame {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  width: 100%;
  margin: 0;
  padding: 6px 8px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.vista-error-frame:hover { background: #2a2d2e; }
.vista-error-frame-name {
  font-size: 12px;
  font-weight: 500;
  color: #e6edf3;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.vista-error-frame-loc {
  font-size: 11px;
  color: #8b949e;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.vista-error-pagination {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.vista-error-pagination[hidden] { display: none; }
.vista-error-page-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #a1a1a1;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.vista-error-page-btn:disabled { opacity: 0.28; cursor: default; }
.vista-error-page-btn:not(:disabled):hover { background: #2a2a2a; color: #ededed; }
.vista-error-page-count {
  min-width: 36px;
  padding: 0 4px;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  color: #a1a1a1;
  font-variant-numeric: tabular-nums;
}
.vista-error-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #a1a1a1;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}
.vista-error-brand-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.16);
}
.vista-error-toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.vista-error-icon-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #a1a1a1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.vista-error-icon-btn:hover { background: #2a2a2a; color: #ededed; }
.vista-ide-panel-tabs .vista-error-icon-btn:hover { background: #2a2a2a; }
.vista-error-icon-btn svg { width: 14px; height: 14px; display: block; }
.vista-error-icon-btn:focus-visible,
.vista-error-page-btn:focus-visible,
.vista-ide-tab:focus-visible {
  outline: 2px solid #ededed;
  outline-offset: 1px;
}
.vista-error-page-root[data-minimized='true'] .vista-error-backdrop,
.vista-error-page-root[data-minimized='true'] .vista-error-panel {
  display: none;
}
.vista-error-minimized-trigger {
  position: fixed;
  left: 20px;
  bottom: 20px;
  z-index: 2147483647;
  height: 36px;
  border-radius: 999px;
  border: 1px solid #262626;
  background: #0a0a0a;
  color: #ededed;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px 0 10px;
  cursor: pointer;
}
.vista-error-minimized-trigger[hidden] { display: none; }
.vista-error-minimized-logo { width: 13px; height: 13px; display: block; }
.vista-error-minimized-close { font-size: 14px; line-height: 1; color: #a1a1a1; }
.vista-error-minimized-count {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #ff6369;
}
@keyframes vista-overlay-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (max-width: 720px) {
  .vista-error-page-root { padding: 16px 10px; }
  .vista-error-headline { font-size: 14px; }
  .vista-error-minimized-trigger { left: 12px; bottom: 12px; }
}
`;

const OVERLAY_SCRIPT = `
function vistaReload() {
  window.location.reload();
}

function vistaOpenInEditor(file, line, column) {
  if (!file) return;
  var normalized = String(file).replace(/\\\\/g, '/');
  var lineNum = Number(line || 1);
  var colNum = Number(column || 1);
  window.location.href = 'vscode://file/' + normalized + ':' + lineNum + ':' + colNum;
}

function vistaCopyText(value) {
  var text = String(value || '');
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
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
`;

// ============================================================================
// Helpers
// ============================================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeForInlineScript(text: string): string {
  return text.replace(/<\/script/gi, '<\\/script');
}

function colorizeLineHtml(line: string): string {
  let escaped = escapeHtml(line);
  const isActive = /^\s*>/.test(line);

  if (/^\s*\^+/.test(line)) {
    return `<span class="vista-error-tok-caret">${escaped}</span>`;
  }
  if (/^\s*at\s+/.test(line)) {
    return `<span class="vista-error-tok-stack">${escaped}</span>`;
  }

  const numbered = escaped.match(/^(\s*>?\s*\d+)(\s*\|)(.*)$/);
  if (numbered) {
    escaped = `<span class="vista-error-tok-line">${numbered[1]}</span>${numbered[2]}${numbered[3]}`;
  }
  if (isActive) {
    escaped = `<span class="vista-error-tok-active">${escaped}</span>`;
  }

  escaped = escaped.replace(
    /((?:[A-Za-z]:)?[\\/\w.@%:-]+\.(?:tsx?|jsx?|mjs|cjs|css|json|mdx?)(?::\d+(?::\d+)?)?)/g,
    '<span class="vista-error-tok-path">$1</span>'
  );
  escaped = escaped.replace(
    /(&quot;[^&]+&quot;|&#039;[^&]+&#039;|`[^`]+`)/g,
    '<span class="vista-error-tok-string">$1</span>'
  );
  escaped = escaped.replace(
    /(TypeError:|ReferenceError:|SyntaxError:|Error:|Cannot find module|Module not found|Build Error|Runtime Error|Hydration Error)/g,
    '<span class="vista-error-tok-error">$1</span>'
  );

  return escaped;
}

function colorizeBlockHtml(value: string): string {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => colorizeLineHtml(line))
    .join('\n');
}

const SOURCE_KEYWORDS =
  /^(import|from|function|return|const|let|var|export|default|class|extends|if|else|async|await|new|type|interface|true|false|null|undefined|typeof|void|as|of|in|for|while|switch|case|break|continue|try|catch|finally|this)\b/;

function highlightSource(text: string): string {
  let html = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== ch) {
        j += text[j] === '\\' ? 2 : 1;
      }
      html += `<span class="vista-tok-str">${escapeHtml(text.slice(i, Math.min(j + 1, text.length)))}</span>`;
      i = j + 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      html += `<span class="vista-tok-cmt">${escapeHtml(text.slice(i))}</span>`;
      break;
    }
    if (ch === '<' && /[A-Za-z/]/.test(text[i + 1] || '')) {
      const tag = text.slice(i).match(/^<\/?[A-Za-z][\w.-]*/);
      if (tag) {
        html += `<span class="vista-tok-tag">${escapeHtml(tag[0])}</span>`;
        i += tag[0].length;
        continue;
      }
    }
    if (/[0-9]/.test(ch)) {
      const num = text.slice(i).match(/^[0-9]+(?:\.[0-9]+)?/);
      if (num) {
        html += `<span class="vista-tok-num">${escapeHtml(num[0])}</span>`;
        i += num[0].length;
        continue;
      }
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const ident = text.slice(i).match(/^[A-Za-z_$][\w$]*/);
      if (ident) {
        html += SOURCE_KEYWORDS.test(ident[0])
          ? `<span class="vista-tok-kw">${escapeHtml(ident[0])}</span>`
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

function parseCodeFrameLines(
  codeFrame: string
): Array<{ n: number | null; text: string; error: boolean; squiggleAt: number }> {
  const rawLines = String(codeFrame || '').split(/\r?\n/);
  const rows: Array<{ n: number | null; text: string; error: boolean; squiggleAt: number }> = [];

  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i];
    const numbered = line.match(/^(\s*>)?\s*(\d+)\s+\|(.*)$/);
    if (numbered) {
      let text = numbered[3];
      if (text.startsWith(' ')) text = text.slice(1);
      const row = {
        n: Number(numbered[2]),
        text,
        error: Boolean(numbered[1] && numbered[1].includes('>')),
        squiggleAt: -1,
      };
      const next = rawLines[i + 1] || '';
      const caret = next.match(/\|(.*)$/);
      if (caret && caret[1].includes('^')) {
        let mark = caret[1];
        if (mark.startsWith(' ')) mark = mark.slice(1);
        row.squiggleAt = Math.max(0, mark.indexOf('^'));
        row.error = true;
        i += 1;
      }
      rows.push(row);
      continue;
    }
    if (/^\s*\|?\s*\^/.test(line)) continue;
    if (line.trim().length === 0) continue;
    rows.push({ n: null, text: line, error: false, squiggleAt: -1 });
  }

  return rows;
}

function fillEditorRows(
  rows: Array<{ n: number | null; text: string; error: boolean; squiggleAt: number }>,
  errorLine?: number,
  errorColumn?: number
): Array<{ n: number | null; text: string; error: boolean; squiggleAt: number }> {
  const numbered = rows.filter((row) => typeof row.n === 'number');
  if (numbered.length === 0) return rows;
  const min = Math.min(...numbered.map((row) => row.n as number));
  const max = Math.max(...numbered.map((row) => row.n as number));
  const byNumber = new Map(numbered.map((row) => [row.n as number, row]));
  const filled: Array<{ n: number | null; text: string; error: boolean; squiggleAt: number }> = [];
  for (let n = min; n <= max; n += 1) {
    const existing = byNumber.get(n);
    if (existing) {
      if (existing.squiggleAt < 0 && errorLine === n && errorColumn) {
        existing.squiggleAt = Math.max(0, errorColumn - 1);
        existing.error = true;
      }
      filled.push(existing);
    } else {
      filled.push({
        n,
        text: '',
        error: errorLine === n,
        squiggleAt: errorLine === n && errorColumn ? Math.max(0, errorColumn - 1) : -1,
      });
    }
  }
  return filled;
}

function renderIdeCodeHtml(codeFrame: string, errorLine?: number, errorColumn?: number): string {
  const rows = fillEditorRows(parseCodeFrameLines(codeFrame), errorLine, errorColumn);
  const numbered = rows.filter((row) => typeof row.n === 'number');
  if (numbered.length === 0) {
    return renderLogHtml(codeFrame);
  }
  return `<div class="vista-error-editor">${rows
    .map((row) => {
      const squiggle =
        row.squiggleAt >= 0
          ? `<span class="vista-error-squiggle" style="width:3.2ch;margin-left:${row.squiggleAt}ch"></span>`
          : '';
      return `<div class="vista-error-editor-line${row.error ? ' is-error' : ''}"><span class="vista-error-gutter">${
        row.n ?? ''
      }</span><span class="vista-error-source">${highlightSource(row.text)}${squiggle}</span></div>`;
    })
    .join('')}</div>`;
}

function renderLogHtml(text: string, lineClass = ''): string {
  const lines = String(text || '').split(/\r?\n/);
  if (lines.length === 1 && !lines[0]) {
    return '<div class="vista-error-editor"><div class="vista-error-editor-line"><span class="vista-error-gutter"></span><span class="vista-error-source"></span></div></div>';
  }
  return `<div class="vista-error-editor">${lines
    .map(
      (line, index) =>
        `<div class="vista-error-editor-line${lineClass}"><span class="vista-error-gutter">${
          index + 1
        }</span><span class="vista-error-source">${highlightSource(line)}</span></div>`
    )
    .join('')}</div>`;
}

function renderLocationEditor(location: VistaErrorLocation): string {
  if (location.kind === 'server') return renderLogHtml(location.codeFrame || '', ' is-server');
  if (location.kind === 'client') return renderLogHtml(location.codeFrame || '', ' is-client');
  if (location.kind === 'log') return renderLogHtml(location.codeFrame || location.file);
  return renderIdeCodeHtml(location.codeFrame || '', location.line, location.column);
}

function tabLabel(location: VistaErrorLocation): string {
  if (location.kind === 'server') return 'server';
  if (location.kind === 'client') return 'client';
  return fileBasename(location.file);
}

function renderFileTabsHtml(related: VistaErrorLocation[], activeIndex: number): string {
  return related
    .map((location, index) => {
      const name = tabLabel(location);
      const inactive = index === activeIndex ? '' : ' is-inactive';
      return `<button type="button" class="vista-ide-tab${inactive}" data-vista-file-tab="${index}"><svg class="vista-ide-tab-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="2" width="10" height="12" rx="1.5" stroke="#4fc1ff" stroke-width="1.4"/><path d="M6 6h4M6 9h4M6 12h2" stroke="#4fc1ff" stroke-width="1.2" stroke-linecap="round"/></svg><span>${escapeHtml(
        name
      )}</span></button>`;
    })
    .join('');
}

function isNoiseFile(file: string): boolean {
  const normalized = file.replace(/\\/g, '/');
  return /node_modules\/|node:|webpack\/runtime|\/vista\/dist\//.test(normalized);
}

function parseLocationsFromText(text: string): VistaErrorLocation[] {
  const found: VistaErrorLocation[] = [];
  const seen = new Set<string>();
  const pattern =
    /(?:ERROR in\s+)?((?:[A-Za-z]:)?[./\\]?[\w.@/-]+\.(?:tsx?|jsx?|mjs|cjs|css|json|mdx?))(?::(\d+)(?::(\d+))?)?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const file = match[1].replace(/\\/g, '/').replace(/^\.\//, '');
    if (isNoiseFile(file)) continue;
    const key = `${file}:${match[2] || ''}`;
    if (seen.has(key) || seen.has(file)) continue;
    seen.add(file);
    seen.add(key);
    found.push({
      file,
      line: match[2] ? Number(match[2]) : undefined,
      column: match[3] ? Number(match[3]) : undefined,
      kind: 'source',
    });
    if (found.length >= 8) break;
  }
  return found;
}

function parseHydrationMismatch(message: string): { server: string; client: string } | null {
  const serverLines: string[] = [];
  const clientLines: string[] = [];
  for (const rawLine of String(message || '').split(/\r?\n/)) {
    if (/^\s*-\s+(A |Variable |Date |External |Invalid |It can also|https?:)/i.test(rawLine)) continue;
    if (/^\s*-\s+/.test(rawLine)) {
      serverLines.push(rawLine.replace(/^\s*-\s?/, ''));
    } else if (/^\s*\+\s+/.test(rawLine)) {
      clientLines.push(rawLine.replace(/^\s*\+\s?/, ''));
    }
  }
  if (serverLines.length === 0 && clientLines.length === 0) return null;
  return { server: serverLines.join('\n'), client: clientLines.join('\n') };
}

function defaultHint(error: VistaError): string {
  if (error.hint) return error.hint;
  if (error.type === 'hydration') {
    return 'Server HTML did not match the client. Check Date.now(), Math.random(), invalid tag nesting, or a missing \'use client\'.';
  }
  if (error.source === 'server') {
    return 'Thrown while rendering on the server. Open the first app frame in the call stack.';
  }
  if (error.type === 'build' && (error.related?.length || 0) > 1) {
    return `${error.related!.length} files are involved. Switch editor tabs to inspect each one.`;
  }
  return '';
}

function enrichError(error: VistaError): VistaError {
  const message = error.message || '';
  const stack = error.stack || '';
  let type = error.type;
  let source = error.source;
  if (type !== 'hydration' && /hydration|did not match|server rendered html|text content does not match/i.test(message)) {
    type = 'hydration';
  }
  if (!source && /Flight SSR|Server Error|renderToString|rsc-engine|vista[\\/]server/i.test(`${message}\n${stack}`)) {
    source = 'server';
  }

  const related: VistaErrorLocation[] = [];
  const seen = new Set<string>();
  const add = (location: VistaErrorLocation) => {
    const file = location.file.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!file || isNoiseFile(file)) return;
    const kind = location.kind || 'source';
    const key = kind === 'source' || kind === 'log' ? `${kind}:${file}` : `${kind}:${file}:${location.line || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    related.push({ ...location, file, kind });
  };

  if (error.file) {
    add({
      file: error.file,
      line: error.line,
      column: error.column,
      codeFrame: error.codeFrame,
      kind: 'source',
    });
  }

  for (const frame of parseStackFrames(stack)) {
    if (!frame.file) continue;
    add({ file: frame.file, line: frame.line || undefined, column: frame.column || undefined, kind: 'source' });
  }

  for (const location of parseLocationsFromText(`${message}\n${stack}`)) {
    add(location);
  }

  const mismatch = type === 'hydration' ? parseHydrationMismatch(message) : null;
  if (mismatch) {
    if (mismatch.server) add({ file: 'server.html', codeFrame: mismatch.server, kind: 'server' });
    if (mismatch.client) add({ file: 'client.html', codeFrame: mismatch.client, kind: 'client' });
  }

  if (related.length === 0) {
    add({
      file: error.file || (type === 'build' ? 'build.log' : 'error.log'),
      line: error.line,
      column: error.column,
      codeFrame: error.codeFrame || (error.stack ? error.stack : error.message),
      kind: error.codeFrame ? 'source' : 'log',
    });
  } else if (error.codeFrame && !related[0].codeFrame) {
    related[0] = { ...related[0], codeFrame: error.codeFrame };
  }

  const primary = related.find((item) => item.kind === 'source') || related[0];
  const next: VistaError = {
    ...error,
    type,
    source,
    file: error.file || primary?.file,
    line: error.line || primary?.line,
    column: error.column || primary?.column,
    related,
  };
  next.hint = defaultHint(next);
  return next;
}

function parseStackFrames(stack: string): Array<{ name: string; file: string; line: number; column: number }> {
  return parseStackTrace(stack).map((line) => {
    const match = line.match(
      /^\s*at\s+(?:async\s+)?(?:(.+?)\s+\()?((?:[A-Za-z]:)?[^()\s]+):(\d+):(\d+)\)?\s*$/
    );
    if (match) {
      return {
        name: (match[1] || '(anonymous)').replace(/^Object\./, ''),
        file: match[2],
        line: Number(match[3]),
        column: Number(match[4]),
      };
    }
    return { name: line.replace(/^\s*at\s+/, ''), file: '', line: 0, column: 0 };
  });
}

function renderStackFramesHtml(stack: string): string {
  const frames = parseStackFrames(stack);
  if (frames.length === 0) return '';
  return `<div class="vista-error-frames">${frames
    .map((frame) => {
      const loc = frame.file
        ? `${frame.file.replace(/\\/g, '/')}${frame.line ? `:${frame.line}` : ''}${
            frame.column ? `:${frame.column}` : ''
          }`
        : '';
      const open = frame.file
        ? ` data-vista-open-file="${escapeHtml(frame.file)}" data-vista-open-line="${frame.line || 1}" data-vista-open-col="${frame.column || 1}"`
        : '';
      return `<button type="button" class="vista-error-frame"${open}><span class="vista-error-frame-name">${escapeHtml(
        frame.name
      )}</span>${loc ? `<span class="vista-error-frame-loc">${escapeHtml(loc)}</span>` : ''}</button>`;
    })
    .join('')}</div>`;
}

function parseStackTrace(stack: string): string[] {
  if (!stack) return [];
  return stack
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
}

function normalizeError(error: VistaError | null | undefined): VistaError {
  return enrichError({
    type:
      error?.type === 'build' || error?.type === 'hydration' || error?.type === 'runtime'
        ? error.type
        : 'runtime',
    source: error?.source === 'server' || error?.source === 'client' ? error.source : undefined,
    message: typeof error?.message === 'string' ? error.message : 'Unknown Error',
    stack: typeof error?.stack === 'string' ? error.stack : undefined,
    file: typeof error?.file === 'string' ? error.file : undefined,
    line: typeof error?.line === 'number' ? error.line : undefined,
    column: typeof error?.column === 'number' ? error.column : undefined,
    codeFrame: typeof error?.codeFrame === 'string' ? error.codeFrame : undefined,
    related: Array.isArray(error?.related) ? error.related : undefined,
    hint: typeof error?.hint === 'string' ? error.hint : undefined,
  });
}

function normalizeErrors(errors: VistaError[]): VistaError[] {
  if (!Array.isArray(errors) || errors.length === 0) {
    return [normalizeError({ type: 'runtime', message: 'Unknown Error' })];
  }

  return errors.map((error) => normalizeError(error));
}

function locationHasCode(location: VistaErrorLocation | undefined): boolean {
  if (!location) return false;
  if ((location.kind || 'source') !== 'source') return false;
  return Boolean(location.codeFrame && String(location.codeFrame).trim());
}

function hasCodeView(error: VistaError): boolean {
  const related = error.related || [];
  if (related.some(locationHasCode)) return true;
  return Boolean(error.codeFrame && String(error.codeFrame).trim());
}

function getErrorTypeLabel(error: VistaError): string {
  if (error.type === 'build') return 'Build Error';
  if (error.type === 'hydration') return 'Hydration Error';
  if (error.source === 'server') return 'Server Error';
  return 'Unhandled Runtime Error';
}

function problemTone(error: VistaError): string {
  if (error.type === 'hydration') return 'hydration';
  if (error.source === 'server') return 'server';
  return '';
}

function sourceBadge(error: VistaError): { label: string; tone: string } | null {
  if (error.type === 'hydration') return { label: 'Hydration', tone: 'hydration' };
  if (error.source === 'server') return { label: 'Server', tone: 'server' };
  if (error.source === 'client') return { label: 'Client', tone: 'client' };
  if (error.type === 'build') return { label: 'Build', tone: '' };
  return { label: 'Client', tone: 'client' };
}

export function fromCaughtError(
  error: unknown,
  options?: { type?: VistaError['type']; source?: 'server' | 'client' }
): VistaError {
  const err = error instanceof Error ? error : new Error(String(error || 'Unknown Error'));
  return normalizeError({
    type: options?.type || 'runtime',
    source: options?.source,
    message: err.message || 'Unknown Error',
    stack: err.stack,
  });
}

function splitMessage(message: string): { headline: string; detail: string } {
  const lines = String(message || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    headline: lines[0] || 'Unknown Error',
    detail: lines.slice(1).join('\n'),
  };
}

function formatCodeHeader(error: VistaError): string {
  if (!error.file) return '';
  const file = error.file.replace(/\\/g, '/');
  if (!error.line) return file;
  return `${file} (${error.line}${error.column ? `:${error.column}` : ''})`;
}

function fileBasename(file?: string): string {
  if (!file) return 'untitled';
  const normalized = file.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || normalized;
}

function fileBreadcrumb(file?: string): string {
  if (!file) return '';
  return file.replace(/\\/g, '/').split('/').filter(Boolean).join(' › ');
}

function languageFromFile(file?: string): string {
  const ext = (file || '').split('.').pop()?.toLowerCase();
  if (ext === 'tsx') return 'TypeScript React';
  if (ext === 'ts') return 'TypeScript';
  if (ext === 'jsx') return 'JavaScript React';
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return 'JavaScript';
  if (ext === 'css') return 'CSS';
  if (ext === 'json') return 'JSON';
  return 'Plain Text';
}

function statusLine(error: VistaError): string {
  if (!error.line) return 'Ready';
  return `Ln ${error.line}, Col ${error.column || 1}`;
}

function formatLocation(error: VistaError): string {
  if (!error.file) return '';
  const normalized = error.file.replace(/\\/g, '/');
  if (!error.line) return normalized;
  return `${normalized}:${error.line}${error.column ? `:${error.column}` : ''}`;
}

function serializeErrorForCopy(error: VistaError): string {
  const label = getErrorTypeLabel(error);
  const parts = [label, '', error.message || 'Unknown Error'];

  if (error.file) {
    parts.push('');
    parts.push(`File: ${formatLocation(error)}`);
  }

  if (error.codeFrame) {
    parts.push('');
    parts.push('Code Frame:');
    parts.push(error.codeFrame);
  }

  if (error.stack) {
    parts.push('');
    parts.push('Stack Trace:');
    parts.push(error.stack);
  }

  return parts.join('\n');
}

function openInEditorFromBrowser(file?: string, line?: number, column?: number): void {
  if (typeof window === 'undefined' || !file) return;
  const normalized = file.replace(/\\/g, '/');
  const lineNum = line || 1;
  const colNum = column || 1;
  window.location.href = `vscode://file/${normalized}:${lineNum}:${colNum}`;
}

function copyTextInBrowser(value: string): void {
  if (typeof window === 'undefined') return;
  const text = String(value || '');
  if (!text) return;

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
  } catch {
    // no-op
  }
  document.body.removeChild(textarea);
}

// ============================================================================
// Full-page HTML renderer (used directly by engines)
// ============================================================================

/**
 * Render a full HTML error page.
 * Engines should send this directly: `res.status(500).send(renderErrorHTML(...))`.
 */
export function renderErrorHTML(errors: VistaError[]): string {
  const normalizedErrors = normalizeErrors(errors);
  const firstError = normalizedErrors[0];

  const firstLabel = getErrorTypeLabel(firstError);
  const firstParts = splitMessage(firstError.message || 'Unknown Error');
  const firstRelated =
    firstError.related && firstError.related.length > 0
      ? firstError.related
      : [
          {
            file: firstError.file || 'untitled',
            line: firstError.line,
            column: firstError.column,
            codeFrame: firstError.codeFrame,
            kind: 'source' as const,
          },
        ];
  const firstLocationEntry = firstRelated[0];
  const firstLocation = formatCodeHeader(firstError) || formatLocation(firstError);
  const firstStack = parseStackTrace(firstError.stack || '').join('\n');
  const firstCodeHtml = renderLocationEditor(firstLocationEntry);
  const firstCrumbs = fileBreadcrumb(firstLocationEntry.file) || firstLocation || 'Source';
  const firstStatus = firstLocationEntry.line
    ? `Ln ${firstLocationEntry.line}, Col ${firstLocationEntry.column || 1}`
    : statusLine(firstError);
  const firstLang =
    firstLocationEntry.kind === 'server' || firstLocationEntry.kind === 'client'
      ? 'HTML'
      : firstLocationEntry.kind === 'log'
        ? 'Log'
        : languageFromFile(firstLocationEntry.file);
  const firstStackHtml = renderStackFramesHtml(firstStack);
  const firstTabsHtml = renderFileTabsHtml(firstRelated, 0);
  const firstTone = problemTone(firstError);
  const firstBadge = sourceBadge(firstError);
  const firstHint = firstError.hint || '';
  const firstTerminal = !hasCodeView(firstError);
  const firstTitleName = firstTerminal ? firstLabel : tabLabel(firstLocationEntry);
  const showPager = normalizedErrors.length > 1;

  const serializedErrors = escapeForInlineScript(JSON.stringify(normalizedErrors));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Error - Vista</title>
  <style>${OVERLAY_STYLES}</style>
  <script>${OVERLAY_SCRIPT}</script>
  <script>
    // Vista live-reload: auto-refresh error overlay when files change.
    (function() {
      function connect() {
        var es = new EventSource('${SSE_ENDPOINT}');
        es.onmessage = function(e) {
          if (e.data && e.data !== 'connected') {
            window.location.reload();
          }
        };
        es.onerror = function() {
          es.close();
          setTimeout(connect, 1500);
        };
      }
      connect();
    })();

    (function() {
      var errors = ${serializedErrors};
      if (!Array.isArray(errors) || errors.length === 0) {
        errors = [{ type: 'runtime', message: 'Unknown Error' }];
      }

      var state = { index: 0, fileTab: 0, errors: errors };
      var typeNode;
      var titleNode;
      var hintNode;
      var fileTabsNode;
      var sourceBadgeNode;
      var problemIconNode;
      var tabNameNodes;
      var crumbsNode;
      var statusLnNode;
      var statusLangNode;
      var locationButton;
      var codeWrap;
      var codeNode;
      var stackWrap;
      var stackNode;
      var paginationNode;
      var countNode;
      var prevButton;
      var nextButton;
      var copyButton;
      var rootNode;
      var panelNode;
      var backdropNode;
      var minimizedTrigger;
      var minimizedCount;
      var mainNode;
      var panelExpandButton;

      function getLabel(error) {
        if (error.type === 'build') return 'Build Error';
        if (error.type === 'hydration') return 'Hydration Error';
        if (error.source === 'server') return 'Server Error';
        return 'Unhandled Runtime Error';
      }

      function splitMessage(message) {
        var lines = String(message || '')
          .split(/\\r?\\n/)
          .map(function(line) { return line.trim(); })
          .filter(function(line) { return line.length > 0; });
        return {
          headline: lines.length ? lines[0] : 'Unknown Error',
          detail: lines.slice(1).join('\\n')
        };
      }

      function formatCodeHeader(error) {
        if (!error || !error.file) return '';
        var file = String(error.file).replace(/\\\\/g, '/');
        var line = Number(error.line || 0);
        var column = Number(error.column || 0);
        if (!line) return file;
        return file + ' (' + line + (column ? ':' + column : '') + ')';
      }

      function currentError() {
        if (!state.errors || state.errors.length === 0) return null;
        var idx = state.index;
        if (idx < 0) idx = 0;
        if (idx > state.errors.length - 1) idx = state.errors.length - 1;
        return state.errors[idx];
      }

      function formatLocation(error) {
        if (!error || !error.file) return '';
        var file = String(error.file).replace(/\\\\/g, '/');
        var line = Number(error.line || 0);
        var column = Number(error.column || 0);
        if (!line) return file;
        return file + ':' + line + (column ? ':' + column : '');
      }

      function escapeHtml(value) {
        return String(value || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      function highlightSource(text) {
        var html = '';
        var i = 0;
        var keywords = /^(import|from|function|return|const|let|var|export|default|class|extends|if|else|async|await|new|type|interface|true|false|null|undefined|typeof|void|as|of|in|for|while|switch|case|break|continue|try|catch|finally|this)\\b/;
        while (i < text.length) {
          var ch = text.charAt(i);
          if (ch === String.fromCharCode(39) || ch === String.fromCharCode(34) || ch === String.fromCharCode(96)) {
            var j = i + 1;
            while (j < text.length && text.charAt(j) !== ch) {
              j += text.charAt(j) === '\\\\' ? 2 : 1;
            }
            html += '<span class=\"vista-tok-str\">' + escapeHtml(text.slice(i, Math.min(j + 1, text.length))) + '</span>';
            i = j + 1;
            continue;
          }
          if (ch === '/' && text.charAt(i + 1) === '/') {
            html += '<span class=\"vista-tok-cmt\">' + escapeHtml(text.slice(i)) + '</span>';
            break;
          }
          if (ch === '<' && /[A-Za-z\\/]/.test(text.charAt(i + 1) || '')) {
            var tag = text.slice(i).match(/^<\\/?[A-Za-z][\\w.-]*/);
            if (tag) {
              html += '<span class=\"vista-tok-tag\">' + escapeHtml(tag[0]) + '</span>';
              i += tag[0].length;
              continue;
            }
          }
          if (/[0-9]/.test(ch)) {
            var num = text.slice(i).match(/^[0-9]+(?:\\.[0-9]+)?/);
            if (num) {
              html += '<span class=\"vista-tok-num\">' + escapeHtml(num[0]) + '</span>';
              i += num[0].length;
              continue;
            }
          }
          if (/[A-Za-z_$]/.test(ch)) {
            var ident = text.slice(i).match(/^[A-Za-z_$][\\w$]*/);
            if (ident) {
              html += keywords.test(ident[0])
                ? '<span class=\"vista-tok-kw\">' + escapeHtml(ident[0]) + '</span>'
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

      function renderIdeCode(codeFrame, errorLine, errorColumn) {
        var rawLines = String(codeFrame || '').split(/\\r?\\n/);
        var rows = [];
        for (var i = 0; i < rawLines.length; i += 1) {
          var line = rawLines[i];
          var numbered = line.match(/^(\\s*>)?\\s*(\\d+)\\s+\\|(.*)$/);
          if (!numbered) continue;
          var src = numbered[3];
          if (src.charAt(0) === ' ') src = src.slice(1);
          var isError = !!(numbered[1] && numbered[1].indexOf('>') !== -1);
          var squiggleAt = -1;
          var next = rawLines[i + 1] || '';
          var caret = next.match(/\\|(.*)$/);
          if (caret && caret[1].indexOf('^') !== -1) {
            var mark = caret[1];
            if (mark.charAt(0) === ' ') mark = mark.slice(1);
            squiggleAt = Math.max(0, mark.indexOf('^'));
            isError = true;
            i += 1;
          }
          rows.push({ n: Number(numbered[2]), text: src, error: isError, squiggleAt: squiggleAt });
        }
        if (!rows.length) return '';
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
          html += '<div class=\"vista-error-editor-line' + (row.error ? ' is-error' : '') + '\">';
          html += '<span class=\"vista-error-gutter\">' + row.n + '</span>';
          html += '<span class=\"vista-error-source\">' + highlightSource(row.text);
          if (row.squiggleAt >= 0) {
            html += '<span class=\"vista-error-squiggle\" style=\"width:3.2ch;margin-left:' + row.squiggleAt + 'ch\"></span>';
          }
          html += '</span></div>';
        }
        return '<div class=\"vista-error-editor\">' + html + '</div>';
      }

      function renderLog(text, extraClass) {
        var lines = String(text || '').split(/\\r?\\n/);
        var html = '';
        for (var i = 0; i < lines.length; i += 1) {
          html += '<div class=\"vista-error-editor-line' + (extraClass || '') + '\">';
          html += '<span class=\"vista-error-gutter\">' + (i + 1) + '</span>';
          html += '<span class=\"vista-error-source\">' + highlightSource(lines[i]) + '</span></div>';
        }
        return '<div class=\"vista-error-editor\">' + html + '</div>';
      }

      function relatedFor(error) {
        if (error.related && error.related.length) return error.related;
        return [{ file: error.file || 'untitled', line: error.line, column: error.column, codeFrame: error.codeFrame, kind: 'source' }];
      }

      function locationHasCode(loc) {
        if (!loc) return false;
        if ((loc.kind || 'source') !== 'source') return false;
        return !!(loc.codeFrame && String(loc.codeFrame).trim());
      }

      function hasCodeView(error) {
        var related = relatedFor(error);
        for (var i = 0; i < related.length; i += 1) {
          if (locationHasCode(related[i])) return true;
        }
        return !!(error.codeFrame && String(error.codeFrame).trim());
      }

      function tabLabelFor(loc) {
        if (loc.kind === 'server') return 'server';
        if (loc.kind === 'client') return 'client';
        var file = String(loc.file || 'untitled').replace(/\\\\/g, '/');
        return file.split('/').filter(Boolean).pop() || file;
      }

      function renderLocation(loc) {
        if (loc.kind === 'server') return renderLog(loc.codeFrame || '', ' is-server');
        if (loc.kind === 'client') return renderLog(loc.codeFrame || '', ' is-client');
        if (loc.kind === 'log') return renderLog(loc.codeFrame || loc.file || '');
        var frame = loc.codeFrame || '';
        var html = renderIdeCode(frame, loc.line, loc.column);
        return html || renderLog(frame);
      }

      function renderFileTabs(related, active) {
        var html = '';
        for (var i = 0; i < related.length; i += 1) {
          html += '<button type=\"button\" class=\"vista-ide-tab' + (i === active ? '' : ' is-inactive') + '\" data-vista-file-tab=\"' + i + '\">';
          html += '<svg class=\"vista-ide-tab-icon\" viewBox=\"0 0 16 16\" fill=\"none\" aria-hidden=\"true\"><rect x=\"3\" y=\"2\" width=\"10\" height=\"12\" rx=\"1.5\" stroke=\"#4fc1ff\" stroke-width=\"1.4\"/><path d=\"M6 6h4M6 9h4M6 12h2\" stroke=\"#4fc1ff\" stroke-width=\"1.2\" stroke-linecap=\"round\"/></svg>';
          html += '<span>' + escapeHtml(tabLabelFor(related[i])) + '</span></button>';
        }
        return html;
      }

      function langFor(loc) {
        if (loc.kind === 'server' || loc.kind === 'client') return 'HTML';
        if (loc.kind === 'log') return 'Log';
        var ext = String(loc.file || '').split('.').pop().toLowerCase();
        if (ext === 'tsx') return 'TypeScript React';
        if (ext === 'ts') return 'TypeScript';
        if (ext === 'jsx') return 'JavaScript React';
        if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return 'JavaScript';
        return 'Plain Text';
      }

      function renderStackFrames(stack) {
        var lines = String(stack || '').split(/\\r?\\n/).filter(function(line) { return line.trim().length > 0; });
        var html = '';
        for (var s = 0; s < lines.length; s += 1) {
          var line = lines[s];
          var match = line.match(/^\\s*at\\s+(?:async\\s+)?(?:(.+?)\\s+\\()?((?:[A-Za-z]:)?[^()\\s]+):(\\d+):(\\d+)\\)?\\s*$/);
          var name = line.replace(/^\\s*at\\s+/, '');
          var file = '';
          var ln = 1;
          var col = 1;
          var loc = '';
          if (match) {
            name = (match[1] || '(anonymous)').replace(/^Object\\./, '');
            file = match[2];
            ln = Number(match[3]);
            col = Number(match[4]);
            loc = file.replace(/\\\\/g, '/') + ':' + ln + ':' + col;
          }
          html += '<button type=\"button\" class=\"vista-error-frame\"';
          if (file) {
            html += ' data-vista-open-file=\"' + escapeHtml(file) + '\" data-vista-open-line=\"' + ln + '\" data-vista-open-col=\"' + col + '\"';
          }
          html += '><span class=\"vista-error-frame-name\">' + escapeHtml(name) + '</span>';
          if (loc) html += '<span class=\"vista-error-frame-loc\">' + escapeHtml(loc) + '</span>';
          html += '</button>';
        }
        return html ? '<div class=\"vista-error-frames\">' + html + '</div>' : '';
      }

      function minimizeOverlay() {
        if (!rootNode) return;
        rootNode.setAttribute('data-minimized', 'true');
        if (minimizedTrigger) minimizedTrigger.hidden = false;
        var indicator = window.__VISTA_DEVTOOLS_INDICATOR__;
        if (indicator && typeof indicator.setError === 'function') {
          indicator.setError('runtime-error', state.errors.length);
        }
      }

      function restoreOverlay() {
        if (!rootNode) return;
        rootNode.removeAttribute('data-minimized');
        if (minimizedTrigger) minimizedTrigger.hidden = true;
        var indicator = window.__VISTA_DEVTOOLS_INDICATOR__;
        if (indicator && typeof indicator.clearError === 'function') {
          indicator.clearError();
        }
      }

      function render() {
        var error = currentError();
        if (!error) return;

        var label = getLabel(error);
        var message = typeof error.message === 'string' ? error.message : String(error.message || 'Unknown Error');
        var parts = splitMessage(message);
        var stack = typeof error.stack === 'string' ? error.stack.trim() : '';
        var related = relatedFor(error);
        if (state.fileTab > related.length - 1) state.fileTab = 0;
        var loc = related[state.fileTab] || related[0];
        var terminal = !hasCodeView(error);
        var file = String((loc && loc.file) || error.file || '').replace(/\\\\/g, '/');
        var tabName = terminal ? label : (loc ? tabLabelFor(loc) : 'untitled');
        var crumbs = file ? file.split('/').filter(Boolean).join(' › ') : 'Source';
        var lang = loc ? langFor(loc) : 'Plain Text';
        var tone = error.type === 'hydration' ? 'hydration' : error.source === 'server' ? 'server' : '';
        var badge = error.type === 'hydration' ? 'Hydration' : error.source === 'server' ? 'Server' : error.type === 'build' ? 'Build' : 'Client';
        var badgeTone = error.type === 'hydration' ? 'hydration' : error.source === 'server' ? 'server' : error.source === 'client' || error.type !== 'build' ? 'client' : '';
        var hint = error.hint || '';

        if (typeNode) {
          typeNode.textContent = label;
          typeNode.className = 'vista-error-kind' + (tone ? ' is-' + tone : '');
        }
        if (problemIconNode) {
          problemIconNode.className = 'vista-error-problem-icon' + (tone ? ' is-' + tone : '');
        }
        if (titleNode) titleNode.textContent = parts.headline;
        if (detailNode) {
          detailNode.textContent = parts.detail;
          detailNode.hidden = parts.detail.length === 0;
        }
        if (hintNode) {
          hintNode.textContent = hint;
          hintNode.hidden = hint.length === 0;
        }

        if (tabNameNodes) {
          for (var t = 0; t < tabNameNodes.length; t += 1) tabNameNodes[t].textContent = tabName;
        }
        if (fileTabsNode) fileTabsNode.innerHTML = renderFileTabs(related, state.fileTab);
        if (crumbsNode) crumbsNode.textContent = crumbs;
        if (statusLnNode) statusLnNode.textContent = loc && loc.line ? ('Ln ' + loc.line + ', Col ' + (loc.column || 1)) : (error.line ? ('Ln ' + error.line + ', Col ' + (error.column || 1)) : 'Ready');
        if (statusLangNode) statusLangNode.textContent = lang;
        if (sourceBadgeNode) {
          sourceBadgeNode.textContent = badge;
          sourceBadgeNode.className = 'vista-ide-source-badge' + (badgeTone ? ' is-' + badgeTone : '');
        }

        if (codeNode) codeNode.innerHTML = renderLocation(loc || { file: file, codeFrame: error.codeFrame, line: error.line, column: error.column, kind: 'source' });

        if (stackWrap) stackWrap.hidden = stack.length === 0;
        if (stackNode) stackNode.innerHTML = renderStackFrames(stack);

        if (countNode) countNode.textContent = (state.index + 1) + '/' + state.errors.length;
        if (paginationNode) paginationNode.hidden = state.errors.length <= 1;
        if (prevButton) prevButton.disabled = state.index <= 0;
        if (nextButton) nextButton.disabled = state.index >= state.errors.length - 1;
        if (minimizedCount) minimizedCount.textContent = String(state.errors.length);
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
      }

      function changeIndex(offset) {
        var next = state.index + offset;
        if (next < 0 || next > state.errors.length - 1) return;
        state.index = next;
        state.fileTab = 0;
        render();
      }

      function bind() {
        rootNode = document.querySelector('[data-vista-error-root]');
        panelNode = document.querySelector('[data-vista-error-panel]');
        backdropNode = document.querySelector('[data-vista-error-backdrop]');
        typeNode = document.querySelector('[data-vista-error-type]');
        titleNode = document.querySelector('[data-vista-error-title]');
        detailNode = document.querySelector('[data-vista-error-detail]');
        hintNode = document.querySelector('[data-vista-error-hint]');
        problemIconNode = document.querySelector('.vista-error-problem-icon');
        tabNameNodes = document.querySelectorAll('[data-vista-tab-name]');
        crumbsNode = document.querySelector('[data-vista-crumbs]');
        statusLnNode = document.querySelector('[data-vista-status-ln]');
        statusLangNode = document.querySelector('[data-vista-status-lang]');
        sourceBadgeNode = document.querySelector('[data-vista-source-badge]');
        fileTabsNode = document.querySelector('[data-vista-file-tabs]');
        codeWrap = document.querySelector('[data-vista-code-wrap]');
        codeNode = document.querySelector('[data-vista-code]');
        stackWrap = document.querySelector('[data-vista-stack-wrap]');
        stackNode = document.querySelector('[data-vista-stack]');
        paginationNode = document.querySelector('[data-vista-pagination]');
        countNode = document.querySelector('[data-vista-count]');
        prevButton = document.querySelector('[data-vista-prev-btn]');
        nextButton = document.querySelector('[data-vista-next-btn]');
        copyButton = document.querySelector('[data-vista-copy-btn]');
        minimizedTrigger = document.querySelector('[data-vista-minimized-trigger]');
        minimizedCount = document.querySelector('[data-vista-minimized-count]');
        mainNode = document.querySelector('[data-vista-ide-main]');
        panelExpandButton = document.querySelector('[data-vista-panel-expand]');

        if (prevButton) {
          prevButton.addEventListener('click', function() { changeIndex(-1); });
        }

        if (nextButton) {
          nextButton.addEventListener('click', function() { changeIndex(1); });
        }

        if (copyButton) {
          copyButton.addEventListener('click', function() {
            var error = currentError();
            if (!error) return;
            var label = getLabel(error);
            var message = typeof error.message === 'string' ? error.message : String(error.message || 'Unknown Error');
            var text = label + '\\n\\n' + message;
            var location = formatLocation(error);
            if (location) text += '\\n\\nFile: ' + location;
            if (error.codeFrame) text += '\\n\\nCode Frame:\\n' + error.codeFrame;
            if (error.stack) text += '\\n\\nStack Trace:\\n' + error.stack;
            vistaCopyText(text);
          });
        }

        if (fileTabsNode) {
          fileTabsNode.addEventListener('click', function(event) {
            var target = event.target && event.target.closest ? event.target.closest('[data-vista-file-tab]') : null;
            if (!target) return;
            var nextTab = Number(target.getAttribute('data-vista-file-tab') || 0);
            var error = currentError();
            var related = error ? relatedFor(error) : [];
            var loc = related[nextTab];
            if (nextTab === state.fileTab && loc && loc.kind === 'source' && loc.file && loc.file.indexOf('.html') === -1) {
              vistaOpenInEditor(loc.file, Number(loc.line || 1), Number(loc.column || 1));
              return;
            }
            state.fileTab = nextTab;
            render();
          });
        }

        if (panelExpandButton && mainNode) {
          panelExpandButton.addEventListener('click', function() {
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

        if (stackWrap) {
          stackWrap.addEventListener('click', function(event) {
            var target = event.target && event.target.closest ? event.target.closest('[data-vista-open-file]') : null;
            if (!target) return;
            vistaOpenInEditor(
              target.getAttribute('data-vista-open-file'),
              Number(target.getAttribute('data-vista-open-line') || 1),
              Number(target.getAttribute('data-vista-open-col') || 1)
            );
          });
        }

        if (backdropNode) {
          backdropNode.addEventListener('click', function() {
            minimizeOverlay();
          });
        }

        if (panelNode) {
          panelNode.addEventListener('click', function(event) {
            event.stopPropagation();
          });
        }

        if (minimizedTrigger) {
          minimizedTrigger.addEventListener('click', function() {
            restoreOverlay();
          });
        }

        document.addEventListener('keydown', function(event) {
          if (event.key === 'ArrowLeft') {
            changeIndex(-1);
          } else if (event.key === 'ArrowRight') {
            changeIndex(1);
          } else if (event.key === 'Escape') {
            if (mainNode && mainNode.getAttribute('data-panel-expanded') === 'true' && mainNode.getAttribute('data-terminal') !== 'true') {
              mainNode.removeAttribute('data-panel-expanded');
              if (panelExpandButton) {
                panelExpandButton.setAttribute('aria-pressed', 'false');
                panelExpandButton.setAttribute('aria-label', 'Expand problems panel');
              }
              return;
            }
            minimizeOverlay();
          }
        });
      }

      document.addEventListener('DOMContentLoaded', function() {
        bind();
        render();
      });
    })();
  </script>
</head>
<body>
  <div class="vista-error-page-root" data-vista-error-root>
    <div class="vista-error-backdrop" data-vista-error-backdrop></div>
    <section class="vista-error-panel" data-vista-error-panel role="dialog" aria-label="Vista Error Overlay" aria-modal="true">
      <div class="vista-ide-titlebar">
        <div class="vista-ide-traffic" aria-hidden="true">
          <span class="is-close"></span><span class="is-min"></span><span class="is-max"></span>
        </div>
        <div class="vista-ide-title">Vista — <span data-vista-tab-name>${escapeHtml(firstTitleName)}</span></div>
        <div class="vista-error-toolbar">
          <button type="button" class="vista-error-icon-btn" data-vista-copy-btn aria-label="Copy error">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.6"/><rect x="5" y="5" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.6"/></svg>
          </button>
          <button type="button" class="vista-error-icon-btn" onclick="vistaReload()" aria-label="Reload page">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M20 4V10H14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="vista-error-pagination" data-vista-pagination${showPager ? '' : ' hidden'}>
            <button type="button" class="vista-error-page-btn" data-vista-prev-btn aria-label="Previous error">‹</button>
            <span class="vista-error-page-count" data-vista-count>1/${normalizedErrors.length}</span>
            <button type="button" class="vista-error-page-btn" data-vista-next-btn aria-label="Next error">›</button>
          </div>
        </div>
      </div>
      <div class="vista-ide-workbench">
        <aside class="vista-ide-activity" aria-hidden="true">
          <span class="vista-ide-activity-item is-active">
            <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="10" height="13" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="10" y="8" width="10" height="13" rx="1.2" stroke="currentColor" stroke-width="1.6"/></svg>
          </span>
        </aside>
        <div class="vista-ide-main" data-vista-ide-main${firstTerminal ? ' data-terminal="true"' : ''}>
          <div class="vista-ide-tabbar">
            <div class="vista-ide-tabs" data-vista-file-tabs>
              ${firstTabsHtml}
            </div>
          </div>
          <div class="vista-ide-crumbs" data-vista-crumbs>${escapeHtml(firstCrumbs || firstLocation || 'Source')}</div>
          <div class="vista-error-code" data-vista-code-wrap>
            <div class="vista-error-editor-host" data-vista-code>${firstCodeHtml}</div>
          </div>
          <div class="vista-ide-statusbar">
            <span data-vista-status-ln>${escapeHtml(firstStatus)}</span>
            <span data-vista-status-lang>${escapeHtml(firstLang)}</span>
            <span class="vista-ide-source-badge${firstBadge ? ` is-${firstBadge.tone}` : ''}" data-vista-source-badge>${escapeHtml(firstBadge ? firstBadge.label : 'Client')}</span>
            <span>UTF-8</span>
          </div>
          <div class="vista-ide-panel">
            <div class="vista-ide-panel-tabs">
              <span class="is-active">PROBLEMS</span>
              <span>CALL STACK</span>
              <button type="button" class="vista-error-icon-btn vista-ide-panel-toggle" data-vista-panel-expand aria-label="Expand problems panel" aria-pressed="false"${firstTerminal ? ' hidden' : ''}>
                <svg class="vista-ide-icon-expand" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 6.5V3h3.5M13 6.5V3h-3.5M3 9.5V13h3.5M13 9.5V13h-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <svg class="vista-ide-icon-restore" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6.5 3v3.5H3M9.5 3v3.5H13M6.5 13V9.5H3M9.5 13V9.5H13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
            <div class="vista-error-body">
              <div class="vista-error-problem">
                <span class="vista-error-problem-icon${firstTone ? ` is-${firstTone}` : ''}" aria-hidden="true"></span>
                <div>
                  <p class="vista-error-kind${firstTone ? ` is-${firstTone}` : ''}" data-vista-error-type>${escapeHtml(firstLabel)}</p>
                  <h1 class="vista-error-headline" data-vista-error-title>${escapeHtml(firstParts.headline)}</h1>
                  <p class="vista-error-detail" data-vista-error-detail${firstParts.detail ? '' : ' hidden'}>${escapeHtml(firstParts.detail)}</p>
                  <p class="vista-error-hint" data-vista-error-hint${firstHint ? '' : ' hidden'}>${escapeHtml(firstHint)}</p>
                </div>
              </div>
              <div class="vista-error-stack" data-vista-stack-wrap${firstStack ? '' : ' hidden'}>
                <h2 class="vista-error-stack-title">CALL STACK</h2>
                <div class="vista-error-frames-host" data-vista-stack>${firstStackHtml}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    <button type="button" class="vista-error-minimized-trigger" data-vista-minimized-trigger hidden aria-label="Reopen error overlay">
      <svg class="vista-error-minimized-logo" viewBox="0 0 168 177" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M81.872 176.988L-2.01405e-06 -2.68173e-06H30.5816L83.5576 121.604L136.774 -2.68173e-06H167.115L85.484 176.988H81.872Z" fill="white"/></svg>
      <span class="vista-error-minimized-close">×</span>
      <span class="vista-error-minimized-count" data-vista-minimized-count>${normalizedErrors.length}</span>
    </button>
  </div>
</body>
</html>`;
}

// ============================================================================
// React Component (kept for DevErrorBoundary + backwards compat)
// ============================================================================

export function ErrorOverlay({ errors }: ErrorOverlayProps): React.ReactElement {
  const normalizedErrors = React.useMemo(() => normalizeErrors(errors), [errors]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isMinimized, setIsMinimized] = React.useState(false);
  const [panelExpanded, setPanelExpanded] = React.useState(false);
  const [fileTab, setFileTab] = React.useState(0);

  React.useEffect(() => {
    if (activeIndex > normalizedErrors.length - 1) {
      setActiveIndex(0);
    }
    setFileTab(0);
  }, [activeIndex, normalizedErrors.length]);

  const currentIndex = Math.max(0, Math.min(activeIndex, normalizedErrors.length - 1));
  const error = normalizedErrors[currentIndex];

  if (!error) {
    return <div />;
  }

  const related =
    error.related && error.related.length > 0
      ? error.related
      : [
          {
            file: error.file || 'untitled',
            line: error.line,
            column: error.column,
            codeFrame: error.codeFrame,
            kind: 'source' as const,
          },
        ];
  const activeLocation = related[Math.max(0, Math.min(fileTab, related.length - 1))] || related[0];
  const isTerminal = !hasCodeView(error);
  const label = getErrorTypeLabel(error);
  const tone = problemTone(error);
  const badge = sourceBadge(error);
  const parts = splitMessage(error.message || 'Unknown Error');
  const location = formatCodeHeader(error) || formatLocation(error);
  const stackText = parseStackTrace(error.stack || '').join('\n');
  const codeHtml = renderLocationEditor(activeLocation);
  const stackHtml = renderStackFramesHtml(stackText);
  const tabName = tabLabel(activeLocation);
  const crumbs = fileBreadcrumb(activeLocation.file) || location || 'Source';
  const status = activeLocation.line
    ? `Ln ${activeLocation.line}, Col ${activeLocation.column || 1}`
    : statusLine(error);
  const language =
    activeLocation.kind === 'server' || activeLocation.kind === 'client'
      ? 'HTML'
      : activeLocation.kind === 'log'
        ? 'Log'
        : languageFromFile(activeLocation.file);

  const minimizeOverlay = React.useCallback(() => {
    setIsMinimized(true);
    if (typeof window !== 'undefined') {
      const indicator = (window as any).__VISTA_DEVTOOLS_INDICATOR__;
      if (indicator && typeof indicator.setError === 'function') {
        indicator.setError(parts.headline || 'Error', normalizedErrors.length);
      }
    }
  }, [normalizedErrors.length, parts.headline]);

  const restoreOverlay = React.useCallback(() => {
    setIsMinimized(false);
    if (typeof window !== 'undefined') {
      const indicator = (window as any).__VISTA_DEVTOOLS_INDICATOR__;
      if (indicator && typeof indicator.clearError === 'function') {
        indicator.clearError();
      }
    }
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (panelExpanded && !isTerminal) {
          setPanelExpanded(false);
        } else {
          minimizeOverlay();
        }
      } else if (event.key === 'ArrowLeft') {
        setActiveIndex((idx) => Math.max(0, idx - 1));
      } else if (event.key === 'ArrowRight') {
        setActiveIndex((idx) => Math.min(normalizedErrors.length - 1, idx + 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [minimizeOverlay, normalizedErrors.length, panelExpanded, isTerminal]);

  return (
    <div className="vista-error-page-root" data-embedded="true" data-minimized={isMinimized ? 'true' : undefined}>
      <style>{OVERLAY_STYLES}</style>
      <div className="vista-error-backdrop" onClick={minimizeOverlay} />
      <section
        className="vista-error-panel"
        role="dialog"
        aria-label="Vista Error Overlay"
        aria-modal
        onClick={(event) => event.stopPropagation()}
      >
        <div className="vista-ide-titlebar">
          <div className="vista-ide-traffic" aria-hidden="true">
            <span className="is-close" />
            <span className="is-min" />
            <span className="is-max" />
          </div>
          <div className="vista-ide-title">
            Vista — <span>{isTerminal ? label : tabName}</span>
          </div>
          <div className="vista-error-toolbar">
            <button
              type="button"
              className="vista-error-icon-btn"
              onClick={() => copyTextInBrowser(serializeErrorForCopy(error))}
              aria-label="Copy error"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                <rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
                <rect x="5" y="5" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </button>
            <button
              type="button"
              className="vista-error-icon-btn"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.reload();
                }
              }}
              aria-label="Reload page"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M20 4V10H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {normalizedErrors.length > 1 ? (
            <div className="vista-error-pagination">
              <button
                type="button"
                className="vista-error-page-btn"
                onClick={() => setActiveIndex((idx) => Math.max(0, idx - 1))}
                disabled={currentIndex === 0}
                aria-label="Previous error"
              >
                ‹
              </button>
              <span className="vista-error-page-count">
                {currentIndex + 1}/{normalizedErrors.length}
              </span>
              <button
                type="button"
                className="vista-error-page-btn"
                onClick={() => setActiveIndex((idx) => Math.min(normalizedErrors.length - 1, idx + 1))}
                disabled={currentIndex >= normalizedErrors.length - 1}
                aria-label="Next error"
              >
                ›
              </button>
            </div>
            ) : null}
          </div>
        </div>
        <div className="vista-ide-workbench">
          <aside className="vista-ide-activity" aria-hidden="true">
            <span className="vista-ide-activity-item is-active">
              <svg viewBox="0 0 24 24" fill="none">
                <rect x="4" y="3" width="10" height="13" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
                <rect x="10" y="8" width="10" height="13" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </span>
          </aside>
          <div className="vista-ide-main" data-panel-expanded={!isTerminal && panelExpanded ? 'true' : undefined} data-terminal={isTerminal ? 'true' : undefined}>
            <div className="vista-ide-tabbar">
              <div className="vista-ide-tabs">
                {related.map((item, index) => (
                  <button
                    key={`${item.kind || 'source'}:${item.file}:${index}`}
                    type="button"
                    className={`vista-ide-tab${index === fileTab ? '' : ' is-inactive'}`}
                    onClick={() => {
                      if (index === fileTab && item.kind === 'source' && item.file && !item.file.endsWith('.html')) {
                        openInEditorFromBrowser(item.file, item.line, item.column);
                        return;
                      }
                      setFileTab(index);
                    }}
                  >
                    <svg className="vista-ide-tab-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="#4fc1ff" strokeWidth="1.4" />
                      <path d="M6 6h4M6 9h4M6 12h2" stroke="#4fc1ff" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                    <span>{tabLabel(item)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="vista-ide-crumbs">{crumbs}</div>
            <div className="vista-error-code">
              <div className="vista-error-editor-host" dangerouslySetInnerHTML={{ __html: codeHtml }} />
            </div>
            <div className="vista-ide-statusbar">
              <span>{status}</span>
              <span>{language}</span>
              {badge ? (
                <span className={`vista-ide-source-badge${badge.tone ? ` is-${badge.tone}` : ''}`}>{badge.label}</span>
              ) : null}
              <span>UTF-8</span>
            </div>
            <div className="vista-ide-panel">
              <div className="vista-ide-panel-tabs">
                <span className="is-active">PROBLEMS</span>
                <span>CALL STACK</span>
                {!isTerminal ? (
                <button
                  type="button"
                  className="vista-error-icon-btn vista-ide-panel-toggle"
                  onClick={() => setPanelExpanded((open) => !open)}
                  aria-label={panelExpanded ? 'Restore problems panel' : 'Expand problems panel'}
                  aria-pressed={panelExpanded}
                >
                  <svg className="vista-ide-icon-expand" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M3 6.5V3h3.5M13 6.5V3h-3.5M3 9.5V13h3.5M13 9.5V13h-3.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg className="vista-ide-icon-restore" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M6.5 3v3.5H3M9.5 3v3.5H13M6.5 13V9.5H3M9.5 13V9.5H13"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                ) : null}
              </div>
              <div className="vista-error-body">
                <div className="vista-error-problem">
                  <span className={`vista-error-problem-icon${tone ? ` is-${tone}` : ''}`} aria-hidden="true" />
                  <div>
                    <p className={`vista-error-kind${tone ? ` is-${tone}` : ''}`}>{label}</p>
                    <h1 className="vista-error-headline">{parts.headline}</h1>
                    {parts.detail ? <p className="vista-error-detail">{parts.detail}</p> : null}
                    {error.hint ? <p className="vista-error-hint">{error.hint}</p> : null}
                  </div>
                </div>
                {stackText ? (
                  <div className="vista-error-stack">
                    <h2 className="vista-error-stack-title">CALL STACK</h2>
                    <div
                      className="vista-error-frames-host"
                      dangerouslySetInnerHTML={{ __html: stackHtml }}
                      onClick={(event) => {
                        const target = (event.target as HTMLElement).closest('[data-vista-open-file]') as HTMLElement | null;
                        if (!target) return;
                        openInEditorFromBrowser(
                          target.getAttribute('data-vista-open-file') || undefined,
                          Number(target.getAttribute('data-vista-open-line') || 1),
                          Number(target.getAttribute('data-vista-open-col') || 1)
                        );
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>
      {isMinimized ? (
        <button
          type="button"
          className="vista-error-minimized-trigger"
          onClick={restoreOverlay}
          aria-label="Reopen error overlay"
        >
          <svg
            className="vista-error-minimized-logo"
            viewBox="0 0 168 177"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M81.872 176.988L-2.01405e-06 -2.68173e-06H30.5816L83.5576 121.604L136.774 -2.68173e-06H167.115L85.484 176.988H81.872Z"
              fill="white"
            />
          </svg>
          <span className="vista-error-minimized-close">×</span>
          <span className="vista-error-minimized-count">{normalizedErrors.length}</span>
        </button>
      ) : null}
    </div>
  );
}

// ============================================================================
// Error Boundary (client-side)
// ============================================================================

export class DevErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <ErrorOverlay
          errors={[
            {
              type: 'runtime',
              message: this.state.error.message || 'Unknown Error',
              stack: this.state.error.stack,
            },
          ]}
        />
      );
    }
    return this.props.children;
  }
}

// Re-exports for backwards compatibility
export { ErrorOverlay as VistaErrorOverlay };
export { DevErrorBoundary as VistaDevErrorBoundary };
