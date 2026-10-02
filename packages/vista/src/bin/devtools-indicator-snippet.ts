/**
 * Returns a plain JS snippet that installs a floating Vista devtools indicator
 * in development builds. The snippet is injected into generated client entries.
 */
export function getDevToolsIndicatorBootstrapSource(bootSessionId: string): string {
  const escapedBootSessionId = JSON.stringify(bootSessionId);
  return `
(function installVistaDevToolsIndicator() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  var hideStorageKey = '__vista_devtools_hidden_boot__';
  var hideBootId = ${escapedBootSessionId};

  function mount() {
    var existingIndicator = window.__VISTA_DEVTOOLS_INDICATOR__;
    if (existingIndicator && existingIndicator.hidden === true) {
      try {
        var hiddenBootId = window.sessionStorage.getItem(hideStorageKey);
        if (hiddenBootId !== hideBootId) {
          window.__VISTA_DEVTOOLS_INDICATOR__ = undefined;
          existingIndicator = undefined;
        }
      } catch (e) {}
    }
    if (existingIndicator && typeof existingIndicator.ensureAttached === 'function') {
      if (existingIndicator.ensureAttached()) return;
      window.__VISTA_DEVTOOLS_INDICATOR__ = undefined;
      existingIndicator = undefined;
    }
    if (existingIndicator) {
      var mountedRoot = document.getElementById('__vista-devtools-root');
      var mountedStyle = document.getElementById('__vista-devtools-style');
      if (mountedRoot && mountedStyle) return;
      window.__VISTA_DEVTOOLS_INDICATOR__ = undefined;
    }
    try {
      if (window.sessionStorage.getItem(hideStorageKey) === hideBootId) {
        return;
      }
    } catch (e) {}

    var style = document.getElementById('__vista-devtools-style');
    if (!style) {
      style = document.createElement('style');
      style.id = '__vista-devtools-style';
      style.textContent = [
      '#__vista-devtools-root{position:fixed;left:28px;bottom:22px;z-index:2147482000;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#fff;}',
      '#__vista-devtools-root [data-vista-trigger]{width:42px;height:42px;border-radius:9999px;border:1px solid rgba(255,255,255,0.16);background:rgba(12,12,12,0.88);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 8px 28px rgba(0,0,0,0.38),inset 0 1px 0 rgba(255,255,255,0.08);position:relative;gap:0;padding:0;transition:transform 200ms cubic-bezier(0.22,1,0.36,1),border-color 200ms ease,background 200ms ease,width 220ms cubic-bezier(0.22,1,0.36,1),padding 220ms cubic-bezier(0.22,1,0.36,1),gap 220ms cubic-bezier(0.22,1,0.36,1),box-shadow 220ms ease;}',
      '#__vista-devtools-root [data-vista-trigger]:hover{transform:translateY(-2px);border-color:rgba(255,255,255,0.34);background:rgba(18,18,18,0.94);box-shadow:0 12px 32px rgba(0,0,0,0.45),inset 0 1px 0 rgba(255,255,255,0.1);}',
      '#__vista-devtools-root [data-vista-trigger]:focus-visible{outline:2px solid rgba(255,255,255,0.55);outline-offset:3px;}',
      '#__vista-devtools-root [data-vista-trigger][data-busy="true"]{border-color:rgba(255,255,255,0.42);}',
      '#__vista-devtools-root [data-vista-trigger][data-error="true"]{width:auto;min-width:42px;height:42px;padding:0 12px 0 11px;justify-content:flex-start;gap:9px;border-color:rgba(255,255,255,0.14);background:linear-gradient(180deg,rgba(28,16,18,0.96),rgba(14,10,11,0.96));box-shadow:0 10px 30px rgba(0,0,0,0.42),0 0 0 1px rgba(255,90,90,0.18),inset 0 1px 0 rgba(255,255,255,0.06);}',
      '#__vista-devtools-root [data-vista-trigger][data-error="true"]:hover{border-color:rgba(255,255,255,0.22);box-shadow:0 14px 34px rgba(0,0,0,0.48),0 0 0 1px rgba(255,90,90,0.28),inset 0 1px 0 rgba(255,255,255,0.08);}',
      '#__vista-devtools-root .vista-devtools-logo{display:block;width:15px;height:15px;flex:0 0 auto;}',
      '#__vista-devtools-root .vista-devtools-logo svg{width:100%;height:100%;display:block;}',
      '#__vista-devtools-root .vista-devtools-logo-fill{fill:#fff;opacity:1;transition:opacity 180ms ease;}',
      '#__vista-devtools-root .vista-devtools-logo-draw{fill:none;stroke:#fff;stroke-width:12;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;stroke-dashoffset:100;opacity:0;}',
      '#__vista-devtools-root [data-vista-trigger][data-busy="true"] .vista-devtools-logo-fill{opacity:0.18;}',
      '#__vista-devtools-root [data-vista-trigger][data-busy="true"] .vista-devtools-logo-draw{opacity:1;animation:vista-devtools-v-draw 900ms ease-in-out infinite;}',
      '#__vista-devtools-root .vista-devtools-error-pill{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:999px;border:1px solid rgba(255,120,120,0.28);background:rgba(255,255,255,0.06);color:rgba(255,228,228,0.96);font-size:11px;font-weight:600;letter-spacing:0.01em;font-variant-numeric:tabular-nums;line-height:1;white-space:nowrap;}',
      '#__vista-devtools-root .vista-devtools-error-dot{width:6px;height:6px;border-radius:999px;background:#ff6b6b;box-shadow:0 0 0 0 rgba(255,107,107,0.45);animation:vista-devtools-error-pulse 1.8s ease-out infinite;flex:0 0 auto;}',
      '#__vista-devtools-root .vista-devtools-error-label{opacity:0.72;font-weight:550;}',
      '#__vista-devtools-root [data-vista-panel]{position:absolute;left:0;bottom:54px;width:244px;padding:10px;border-radius:14px;border:1px solid rgba(255,255,255,0.14);background:rgba(10,10,10,0.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 18px 40px rgba(0,0,0,0.5);}',
      '#__vista-devtools-root [data-vista-panel][hidden]{display:none;}',
      '#__vista-devtools-root .vista-devtools-title{font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.72);margin:0 0 8px;}',
      '#__vista-devtools-root .vista-devtools-row{font-size:12px;display:flex;justify-content:space-between;gap:10px;margin:4px 0;color:rgba(255,255,255,0.92);}',
      '#__vista-devtools-root .vista-devtools-key{color:rgba(255,255,255,0.6);}',
      '#__vista-devtools-root .vista-devtools-value{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;max-width:148px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '#__vista-devtools-root .vista-devtools-actions{margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.12);display:flex;justify-content:flex-end;}',
      '#__vista-devtools-root [data-vista-hide]{font-size:11px;line-height:1;padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,0.26);background:transparent;color:rgba(255,255,255,0.85);cursor:pointer;transition:background 140ms ease,border-color 140ms ease,color 140ms ease;display:inline-flex;align-items:center;gap:5px;}',
      '#__vista-devtools-root [data-vista-hide]:hover{background:rgba(255,255,255,0.12);border-color:rgba(255,255,255,0.5);color:#fff;}',
      '#__vista-devtools-root .vista-hide-icon{width:12px;height:12px;display:block;}',
      '@keyframes vista-devtools-v-draw{0%{stroke-dashoffset:100;opacity:0.35;}45%{stroke-dashoffset:0;opacity:1;}72%{stroke-dashoffset:0;opacity:1;}100%{stroke-dashoffset:-100;opacity:0.35;}}',
      '@keyframes vista-devtools-error-pulse{0%{box-shadow:0 0 0 0 rgba(255,107,107,0.45);}70%{box-shadow:0 0 0 7px rgba(255,107,107,0);}100%{box-shadow:0 0 0 0 rgba(255,107,107,0);}}',
      '@media (max-width:640px){#__vista-devtools-root{left:16px;bottom:14px;}#__vista-devtools-root [data-vista-panel]{width:220px;}}',
      ].join('');
    }
    if (!style.isConnected && document.head) {
      document.head.appendChild(style);
    }

    var root = document.getElementById('__vista-devtools-root');
    if (!root) {
      root = document.createElement('div');
      root.id = '__vista-devtools-root';
      root.innerHTML =
      '<button type="button" aria-label="Vista Dev Tools" aria-expanded="false" data-busy="false" data-vista-trigger>' +
      '<span class="vista-devtools-logo" aria-hidden="true">' +
      '<svg viewBox="0 0 168 177" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path class="vista-devtools-logo-fill" d="M81.872 176.988L-2.01405e-06 -2.68173e-06H30.5816L83.5576 121.604L136.774 -2.68173e-06H167.115L85.484 176.988H81.872Z"></path>' +
      '<path class="vista-devtools-logo-draw" pathLength="100" d="M81.872 176.988L-2.01405e-06 -2.68173e-06H30.5816L83.5576 121.604L136.774 -2.68173e-06H167.115L85.484 176.988H81.872Z"></path>' +
      '</svg>' +
      '</span>' +
      '<span class="vista-devtools-error-pill" data-vista-error-pill hidden>' +
      '<span class="vista-devtools-error-dot" aria-hidden="true"></span>' +
      '<span data-vista-error-count>1</span>' +
      '<span class="vista-devtools-error-label" data-vista-error-label>issue</span>' +
      '</span>' +
      '</button>' +
      '<div data-vista-panel hidden>' +
      '<p class="vista-devtools-title">Vista Dev Tools</p>' +
      '<div class="vista-devtools-row"><span class="vista-devtools-key">status</span><span class="vista-devtools-value" data-vista-status>idle</span></div>' +
      '<div class="vista-devtools-row"><span class="vista-devtools-key">activity</span><span class="vista-devtools-value" data-vista-reason>idle</span></div>' +
      '<div class="vista-devtools-row"><span class="vista-devtools-key">route</span><span class="vista-devtools-value" data-vista-route>/</span></div>' +
      '<div class="vista-devtools-actions"><button type="button" data-vista-hide>' +
      '<svg class="vista-hide-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M3 3L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>' +
      '<path d="M10.58 10.58C10.21 10.95 10 11.45 10 12C10 13.1 10.9 14 12 14C12.55 14 13.05 13.79 13.42 13.42" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>' +
      '<path d="M9.88 5.09C10.55 4.85 11.26 4.72 12 4.72C17 4.72 21 12 21 12C20.39 13.14 19.58 14.16 18.62 15.02M14.12 18.91C13.45 19.15 12.74 19.28 12 19.28C7 19.28 3 12 3 12C3.61 10.86 4.42 9.84 5.38 8.98" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '</svg>' +
      '<span>Hide</span>' +
      '</button></div>' +
      '</div>';
      document.body.appendChild(root);
    } else if (!root.isConnected && document.body) {
      document.body.appendChild(root);
    }

    var button = null;
    var panel = null;
    var statusValue = null;
    var reasonValue = null;
    var routeValue = null;
    var hideButton = null;
    var errorPill = null;
    var errorCountNode = null;
    var errorLabelNode = null;
    var open = false;
    var pendingCount = 0;
    var busyStartedAt = 0;
    var clearTimer = null;
    var minimumBusyMs = 420;
    var hasError = false;
    var errorCount = 1;
    var currentBusy = false;
    var currentReason = 'idle';

    function syncRefs() {
      if (!root) return;
      button = root.querySelector('[data-vista-trigger]');
      panel = root.querySelector('[data-vista-panel]');
      statusValue = root.querySelector('[data-vista-status]');
      reasonValue = root.querySelector('[data-vista-reason]');
      routeValue = root.querySelector('[data-vista-route]');
      hideButton = root.querySelector('[data-vista-hide]');
      errorPill = root.querySelector('[data-vista-error-pill]');
      errorCountNode = root.querySelector('[data-vista-error-count]');
      errorLabelNode = root.querySelector('[data-vista-error-label]');
    }

    function ensureAttached() {
      if (!root) return false;
      var changed = false;
      if (style && !style.isConnected && document.head) {
        document.head.appendChild(style);
        changed = true;
      }
      if (!root.isConnected && document.body) {
        document.body.appendChild(root);
        changed = true;
      }
      if (changed) {
        syncRefs();
        if (panel) panel.hidden = !open;
        if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      return !!root.isConnected;
    }

    syncRefs();

    function hideUntilRestart() {
      try {
        window.sessionStorage.setItem(hideStorageKey, hideBootId);
      } catch (e) {}
      if (root && root.parentNode) root.parentNode.removeChild(root);
      if (style && style.parentNode) style.parentNode.removeChild(style);
      window.__VISTA_DEVTOOLS_INDICATOR__ = {
        hidden: true,
        begin: function () {},
        end: function () {},
        pulse: function () {},
        setRoute: function () {},
        setError: function () {},
        clearError: function () {},
        ensureAttached: function () {
          return false;
        },
        hide: hideUntilRestart,
      };
    }

    function setRoute() {
      ensureAttached();
      if (!routeValue) return;
      routeValue.textContent = window.location.pathname + window.location.search;
    }

    function setState(isBusy, reason) {
      ensureAttached();
      currentBusy = isBusy;
      currentReason = reason || 'idle';
      if (button) button.setAttribute('data-busy', isBusy ? 'true' : 'false');
      if (hasError) return;
      if (statusValue) statusValue.textContent = isBusy ? 'busy' : 'idle';
      if (reasonValue) reasonValue.textContent = currentReason;
    }

    function setError(message, count) {
      ensureAttached();
      hasError = true;
      if (typeof count === 'number' && count > 0) {
        errorCount = Math.max(1, Math.floor(count));
      } else {
        errorCount = 1;
      }
      if (button) {
        button.setAttribute('data-error', 'true');
        button.setAttribute(
          'aria-label',
          'Vista Dev Tools — ' + errorCount + (errorCount === 1 ? ' issue' : ' issues')
        );
      }
      if (errorPill) errorPill.hidden = false;
      if (errorCountNode) errorCountNode.textContent = String(errorCount);
      if (errorLabelNode) errorLabelNode.textContent = errorCount === 1 ? 'issue' : 'issues';
      if (statusValue) statusValue.textContent = 'error';
      if (reasonValue)
        reasonValue.textContent =
          (message ? String(message).slice(0, 56) : 'build-error') + ' (' + errorCount + ')';
    }

    function clearError() {
      ensureAttached();
      hasError = false;
      if (button) {
        button.setAttribute('data-error', 'false');
        button.setAttribute('aria-label', 'Vista Dev Tools');
      }
      if (errorPill) errorPill.hidden = true;
      if (errorLabelNode) errorLabelNode.textContent = 'issue';
      errorCount = 1;
      setState(currentBusy, currentReason);
    }

    function begin(reason) {
      if (clearTimer) {
        clearTimeout(clearTimer);
        clearTimer = null;
      }
      pendingCount += 1;
      if (pendingCount === 1) {
        busyStartedAt = Date.now();
      }
      setState(true, reason || 'activity');
    }

    function end() {
      if (pendingCount > 0) pendingCount -= 1;
      if (pendingCount > 0) return;

      var elapsed = Date.now() - busyStartedAt;
      var wait = elapsed < minimumBusyMs ? minimumBusyMs - elapsed : 0;
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(function () {
        setState(false, 'idle');
        clearTimer = null;
      }, wait);
    }

    function pulse(reason, duration) {
      begin(reason || 'update');
      setTimeout(end, typeof duration === 'number' ? duration : 650);
    }

    function togglePanel() {
      if (!ensureAttached()) return;
      open = !open;
      if (panel) panel.hidden = !open;
      if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
      setRoute();
    }

    if (button) {
      button.addEventListener('click', function () {
        var errorOverlay = window.__VISTA_DEV_ERROR_OVERLAY__;
        if (
          errorOverlay &&
          typeof errorOverlay.restoreFromIndicator === 'function' &&
          errorOverlay.restoreFromIndicator()
        ) {
          return;
        }
        togglePanel();
      });
    }
    if (hideButton) {
      hideButton.addEventListener('click', function () {
        hideUntilRestart();
      });
    }

    var originalPushState = window.history.pushState;
    if (typeof originalPushState === 'function') {
      window.history.pushState = function () {
        begin('navigation');
        var result = originalPushState.apply(this, arguments);
        setRoute();
        setTimeout(end, 0);
        return result;
      };
    }

    var originalReplaceState = window.history.replaceState;
    if (typeof originalReplaceState === 'function') {
      window.history.replaceState = function () {
        begin('navigation');
        var result = originalReplaceState.apply(this, arguments);
        setRoute();
        setTimeout(end, 0);
        return result;
      };
    }

    window.addEventListener('popstate', function () {
      pulse('navigation', 450);
      setRoute();
    });

    if (typeof window.fetch === 'function') {
      var nativeFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        var rawUrl = '';
        if (typeof input === 'string') {
          rawUrl = input;
        } else if (input && typeof input === 'object' && 'url' in input) {
          rawUrl = input.url || '';
        }

        var pathname = '';
        try {
          pathname = new URL(rawUrl, window.location.href).pathname;
        } catch (e) {
          pathname = '';
        }

        var shouldTrack = pathname.indexOf('/rsc') === 0;
        if (!shouldTrack) {
          return nativeFetch(input, init);
        }

        begin('navigation');
        return nativeFetch(input, init).finally(function () {
          end();
          setRoute();
        });
      };
    }

    document.addEventListener('vista:ppr-shell', function () {
      pulse('ppr-shell', 420);
    });
    document.addEventListener('vista:ppr-resume', function (event) {
      var detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
      begin('ppr-' + (detail.mode || 'resume'));
    });
    document.addEventListener('vista:ppr-complete', function (event) {
      var detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
      pulse('ppr-' + (detail.mode || 'complete'), 520);
      clearError();
      setRoute();
    });
    document.addEventListener('vista:ppr-error', function (event) {
      var detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
      setError(detail.message || 'ppr-resume', 1);
    });
    document.addEventListener('vista:rsc-resume-start', function () {
      begin('flight-resume');
    });
    document.addEventListener('vista:rsc-resume-complete', function () {
      pulse('flight-ready', 480);
      clearError();
      setRoute();
    });
    document.addEventListener('vista:rsc-resume-error', function (event) {
      var detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
      setError(detail.message || 'flight-resume', 1);
    });

    setRoute();
    setState(false, 'idle');

    window.__VISTA_DEVTOOLS_INDICATOR__ = {
      begin: begin,
      end: end,
      pulse: pulse,
      setRoute: setRoute,
      setError: setError,
      clearError: clearError,
      ensureAttached: ensureAttached,
      hide: hideUntilRestart,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
`;
}
