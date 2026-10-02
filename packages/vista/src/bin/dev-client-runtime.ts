import { getDevErrorOverlayBootstrapSource } from './dev-error-overlay-snippet';
import { getDevToolsIndicatorBootstrapSource } from './devtools-indicator-snippet';

/**
 * The same development client the default engine injects:
 * devtools indicator, error overlay, and runtime error reporting.
 * Flashpack serves this file instead of keeping a second error UI.
 */
export function getSharedDevClientSource(bootSessionId: string): string {
  return `${getDevToolsIndicatorBootstrapSource(bootSessionId)}
${getDevErrorOverlayBootstrapSource()}
${sharedRuntimeReporterSource()}
`;
}

function sharedRuntimeReporterSource(): string {
  return `
function buildRuntimeMessage(title, error) {
  var value = error;
  var text = '';
  if (value && typeof value === 'object') {
    if (typeof value.message === 'string' && value.message.trim().length > 0) {
      text = value.message;
    }
    if (typeof value.stack === 'string' && value.stack.trim().length > 0) {
      text = text ? text + '\\n\\n' + value.stack : value.stack;
    }
    if (!text && typeof value.toString === 'function') {
      var asString = String(value);
      if (asString && asString !== '[object Object]') text = asString;
    }
  } else if (typeof error === 'string') {
    text = error;
  } else if (error != null) {
    text = String(error);
  }
  if (!text || text === 'undefined' || text === 'null') {
    text = 'Unknown runtime error (no message or stack from the browser).';
  }
  if (text.indexOf(title) === 0) return text;
  return title + '\\n\\n' + text;
}

function revealBootHold() {
  try {
    document.documentElement.setAttribute('data-vista-ready', '');
  } catch (err) {}
}

function reportDevRuntimeError(title, error) {
  if (typeof window === 'undefined') return;
  revealBootHold();
  var indicator = window.__VISTA_DEVTOOLS_INDICATOR__;
  var overlay = window.__VISTA_DEV_ERROR_OVERLAY__;
  var message = buildRuntimeMessage(title, error);
  if (indicator && typeof indicator.setError === 'function') {
    try {
      if (typeof indicator.ensureAttached === 'function') indicator.ensureAttached();
    } catch (err) {}
    indicator.setError(title, 1);
  }
  // Always open the overlay for hard runtime failures — capture/minimize alone
  // leaves a white page when boot never finished painting.
  if (overlay && typeof overlay.show === 'function') {
    overlay.show([message]);
  } else if (overlay && typeof overlay.capture === 'function') {
    overlay.capture([message]);
  }
  if (typeof fetch === 'function') {
    fetch('/_flashpack/client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: title, message: message }),
    }).catch(function () {});
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', function (event) {
    reportDevRuntimeError('Runtime Error', event.error || event.message || 'Script error');
  });
  window.addEventListener('unhandledrejection', function (event) {
    reportDevRuntimeError('Unhandled Promise Rejection', event.reason);
  });
  var nativeConsoleError = console.error.bind(console);
  console.error = function () {
    nativeConsoleError.apply(console, arguments);
    var text = Array.prototype.map.call(arguments, function (item) {
      return item && item.stack ? item.stack : String(item);
    }).join('\\n');
    if (/data-cursor-ref/.test(text)) return;
    if (/Hydration|Uncaught|TypeError|ReferenceError/.test(text)) {
      reportDevRuntimeError('Runtime Error', text);
    }
  };
}
`;
}
