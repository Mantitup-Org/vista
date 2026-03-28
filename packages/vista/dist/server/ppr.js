"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAppPPREnabled = isAppPPREnabled;
exports.isRoutePPREligible = isRoutePPREligible;
exports.getPprShellArtifactPath = getPprShellArtifactPath;
exports.createPartialPrerenderInfo = createPartialPrerenderInfo;
exports.resolvePprRequestMode = resolvePprRequestMode;
exports.injectPprResumeBootstrap = injectPprResumeBootstrap;
const config_1 = require("../config");
function isAppPPREnabled(config) {
    return (0, config_1.resolveCacheComponentsConfig)(config).enabled;
}
function isRoutePPREligible(route, appPprEnabled) {
    if (!appPprEnabled) {
        return false;
    }
    if (!route.loadingPath) {
        return false;
    }
    return route.renderMode === 'static' || route.renderMode === 'isr';
}
function getPprShellArtifactPath(urlPath) {
    const normalized = urlPath === '/' ? '/index' : urlPath;
    return `static/pages${normalized}.shell.html`;
}
function createPartialPrerenderInfo(urlPath) {
    return {
        enabled: true,
        strategy: 'loading-boundary',
        shellArtifact: getPprShellArtifactPath(urlPath),
        resumePath: urlPath,
    };
}
function resolvePprRequestMode(input) {
    const headerValue = String(input.headerValue || '').trim().toLowerCase();
    const queryValue = String(input.queryValue || '').trim().toLowerCase();
    const value = headerValue || queryValue;
    if (value === 'shell') {
        return 'shell';
    }
    if (value === 'resume') {
        return 'resume';
    }
    return 'default';
}
function injectPprResumeBootstrap(shellHtml, urlPath) {
    const payload = JSON.stringify({
        url: urlPath,
        headerName: 'x-vista-prerender',
        headerValue: 'resume',
        queryKey: '__vista_prerender',
        queryValue: 'resume',
    });
    const script = `<script>window.__VISTA_PPR_RESUME__=${payload};(function(){var c=window.__VISTA_PPR_RESUME__;if(!c)return;var root=document.getElementById('root');if(!root)return;var finished=false;function ensureTraceStore(){var existing=window.__VISTA_RUNTIME_TRACE__;if(existing&&typeof existing.pushEvent==='function'&&Array.isArray(existing.events)){return existing;}var store={events:[],lastEvent:null,pushEvent:function(type,detail){var entry={type:type,detail:detail||{},at:Date.now()};store.events.push(entry);if(store.events.length>60){store.events.shift();}store.lastEvent=entry;return entry;}};window.__VISTA_RUNTIME_TRACE__=store;return store;}function trace(type,detail){var store=ensureTraceStore();return store.pushEvent(type,detail||{});}function mark(mode){document.documentElement.setAttribute('data-vista-ppr',mode);}function emit(name,detail){document.dispatchEvent(new CustomEvent(name,{detail:detail}));}trace('ppr-shell-rendered',{url:c.url});mark('shell');emit('vista:ppr-shell',{url:c.url});function complete(detail){trace('ppr-resume-complete',detail);emit('vista:ppr-complete',detail);}function fail(detail,error){trace('ppr-resume-error',{url:detail&&detail.url||c.url,mode:detail&&detail.mode||'unknown',message:(error&&error.message)||String(error||'Unknown PPR resume error')});emit('vista:ppr-error',{url:detail&&detail.url||c.url,mode:detail&&detail.mode||'unknown',message:(error&&error.message)||String(error||'Unknown PPR resume error')});mark('error');console.error('[vista:ppr] resume failed',error);}function fallbackHtmlResume(){var resumeUrl=new URL(c.url,window.location.href);resumeUrl.searchParams.set(c.queryKey,c.queryValue);trace('ppr-resume-start',{url:resumeUrl.toString(),mode:'html'});emit('vista:ppr-resume',{url:resumeUrl.toString(),mode:'html'});fetch(resumeUrl.toString(),{headers:{[c.headerName]:c.headerValue},credentials:'same-origin',cache:'no-store'}).then(function(res){return res.text().then(function(html){return{res:res,html:html,url:resumeUrl.toString()};});}).then(function(result){if(!result.res.ok){throw new Error('Resume request failed with status '+result.res.status);}var parsed=new DOMParser().parseFromString(result.html,'text/html');var nextRoot=parsed.getElementById('root');if(nextRoot){root.innerHTML=nextRoot.innerHTML;}var nextTitle=parsed.querySelector('title');if(nextTitle&&nextTitle.textContent){document.title=nextTitle.textContent;}finished=true;mark('resumed');complete({url:result.url,mode:'html'});}).catch(function(error){fail({url:resumeUrl.toString(),mode:'html'},error);});}function tryFlightResume(){var router=window.__VISTA_RSC_ROUTER__;if(!router||typeof router.resume!=='function'){return false;}finished=true;trace('ppr-resume-start',{url:c.url,mode:'flight'});mark('flight-resume');emit('vista:ppr-resume',{url:c.url,mode:'flight'});router.resume(c.url);return true;}function onFlightComplete(event){var detail=event&&event.detail&&typeof event.detail==='object'?event.detail:{url:c.url};complete({url:detail.url||c.url,mode:'flight'});mark('resumed');}function onFlightError(event){var detail=event&&event.detail&&typeof event.detail==='object'?event.detail:{url:c.url};fail({url:detail.url||c.url,mode:'flight'},new Error(detail.message||'Flight resume failed'));}document.addEventListener('vista:rsc-resume-complete',onFlightComplete,{once:true});document.addEventListener('vista:rsc-resume-error',onFlightError,{once:true});var attempts=0;var maxAttempts=20;function attemptResume(){if(finished)return;if(tryFlightResume())return;attempts++;if(attempts>=maxAttempts){fallbackHtmlResume();return;}setTimeout(attemptResume,100);}document.addEventListener('vista:rsc-router-ready',attemptResume,{once:true});attemptResume();})();</script>`;
    if (/<\/body>/i.test(shellHtml)) {
        return shellHtml.replace(/<\/body>/i, `${script}\n</body>`);
    }
    return `${shellHtml}\n${script}`;
}
