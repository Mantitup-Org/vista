"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VistaAuth = VistaAuth;
const request_context_1 = require("../server/request-context");
const middleware_security_1 = require("../server/middleware-security");
const core_1 = require("./core");
__exportStar(require("./core"), exports);
const CSRF_COOKIE = 'vista.csrf-token';
const STATE_COOKIE = 'vista.oauth-state';
const PKCE_COOKIE = 'vista.pkce';
const CALLBACK_COOKIE = 'vista.oauth-callback';
function cookie(name, value, options = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
    if (options.httpOnly !== false)
        parts.push('HttpOnly');
    if (process.env.NODE_ENV === 'production')
        parts.push('Secure');
    if (options.maxAge != null)
        parts.push(`Max-Age=${options.maxAge}`);
    return parts.join('; ');
}
function expiredCookie(name, options = {}) {
    return cookie(name, '', { maxAge: 0, httpOnly: options.httpOnly });
}
function readCookies(request) {
    const map = new Map();
    const header = request.headers.get('cookie') || '';
    for (const segment of header.split(';')) {
        const [rawName, ...rest] = segment.split('=');
        const name = rawName?.trim();
        if (!name)
            continue;
        try {
            map.set(name, decodeURIComponent(rest.join('=').trim()));
        }
        catch {
            map.set(name, rest.join('=').trim());
        }
    }
    return map;
}
function requestToUrl(request) {
    return new URL(request.url);
}
function json(data, init = {}, extraCookies = []) {
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json');
    for (const item of extraCookies) {
        headers.append('Set-Cookie', item);
    }
    return new Response(JSON.stringify(data), { ...init, headers });
}
function redirect(location, cookies = []) {
    const headers = new Headers({ Location: location });
    for (const item of cookies)
        headers.append('Set-Cookie', item);
    return new Response(null, { status: 302, headers });
}
async function resolveRedirect(config, target, requestUrl) {
    const baseUrl = new URL(requestUrl).origin;
    let location = (0, middleware_security_1.isSafeRedirectLocation)(target, requestUrl) ? target : '/';
    if (config.callbacks?.redirect) {
        location = await config.callbacks.redirect({ url: location, baseUrl });
        if (!(0, middleware_security_1.isSafeRedirectLocation)(location, requestUrl)) {
            location = '/';
        }
    }
    return location;
}
async function createSessionCookie(config, user) {
    const now = Math.floor(Date.now() / 1000);
    let payload = {
        user,
        expires: new Date((now + config.session.maxAge) * 1000).toISOString(),
        iat: now,
        exp: now + config.session.maxAge,
    };
    if (config.callbacks?.jwt) {
        payload = await config.callbacks.jwt({ token: payload, user });
    }
    let session = { user: payload.user, expires: payload.expires };
    if (config.callbacks?.session) {
        session = await config.callbacks.session({ session, token: payload });
    }
    const token = (0, core_1.encryptJwt)(payload, config.secret);
    return {
        session,
        cookie: cookie(config.session.cookieName, token, { maxAge: config.session.maxAge }),
    };
}
async function readSessionFromRequest(request, config) {
    const token = readCookies(request).get(config.session.cookieName);
    if (!token)
        return null;
    const payload = (0, core_1.decryptJwt)(token, config.secret);
    if (!payload?.user)
        return null;
    let session = { user: payload.user, expires: payload.expires };
    if (config.callbacks?.session) {
        session = await config.callbacks.session({ session, token: payload });
    }
    return session;
}
async function exchangeOAuth(provider, code, redirectUri, verifier) {
    const body = new URLSearchParams({
        client_id: provider.clientId,
        client_secret: provider.clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
    });
    const tokenResponse = await fetch(provider.token, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    const tokenJson = (await tokenResponse.json());
    if (!tokenJson.access_token) {
        throw new Error(`${provider.id} token exchange failed`);
    }
    const profileResponse = await fetch(provider.userinfo, {
        headers: { Authorization: `Bearer ${tokenJson.access_token}`, Accept: 'application/json' },
    });
    const profile = await profileResponse.json();
    return provider.profile(profile);
}
function findProvider(config, id) {
    return config.providers.find((provider) => provider.id === id);
}
async function handleAuthRequest(request, config) {
    const url = requestToUrl(request);
    const basePath = config.basePath.replace(/\/$/, '');
    let rest = url.pathname.startsWith(basePath) ? url.pathname.slice(basePath.length) : url.pathname;
    if (rest.startsWith('/'))
        rest = rest.slice(1);
    const [action, providerId] = rest.split('/');
    const origin = url.origin;
    const cookies = readCookies(request);
    const method = request.method.toUpperCase();
    if (action === 'session' && method === 'GET') {
        const session = await readSessionFromRequest(request, config);
        return json(session ? { user: session.user, expires: session.expires } : { user: null });
    }
    if (action === 'csrf' && method === 'GET') {
        const token = cookies.get(CSRF_COOKIE) || (0, core_1.randomToken)(24);
        return json({ csrfToken: token }, {}, [cookie(CSRF_COOKIE, token, { httpOnly: false, maxAge: 60 * 60 })]);
    }
    if (action === 'providers' && method === 'GET') {
        const providers = Object.fromEntries(config.providers.map((provider) => [provider.id, { id: provider.id, name: provider.name, type: provider.type }]));
        return json(providers);
    }
    if (action === 'signout' && (method === 'POST' || method === 'GET')) {
        return redirect(config.pages?.signIn || '/', [
            expiredCookie(config.session.cookieName),
            expiredCookie(CSRF_COOKIE, { httpOnly: false }),
        ]);
    }
    if (action === 'signin' && method === 'GET' && !providerId) {
        const page = config.pages?.signIn;
        if (page)
            return redirect(page);
        const buttons = config.providers
            .map((provider) => `<p><a href="${basePath}/signin/${provider.id}">Continue with ${provider.name}</a></p>`)
            .join('');
        return new Response(`<!doctype html><html><body><h1>Sign in</h1>${buttons}</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    if (action === 'signin' && providerId) {
        const provider = findProvider(config, providerId);
        if (!provider) {
            return json({ error: 'Unknown provider' }, { status: 400 });
        }
        if (provider.type === 'credentials') {
            if (method !== 'POST') {
                return json({ error: 'Credentials sign-in requires POST' }, { status: 405 });
            }
            const contentType = request.headers.get('content-type') || '';
            let credentials = {};
            try {
                if (contentType.includes('application/json')) {
                    credentials = (await request.json()) || {};
                }
                else {
                    const form = await request.formData();
                    credentials = Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value)]));
                }
            }
            catch {
                return json({ error: 'Invalid credentials payload' }, { status: 400 });
            }
            const csrfHeader = request.headers.get('x-csrf-token') ||
                url.searchParams.get('csrfToken') ||
                credentials.csrfToken ||
                '';
            const csrfCookie = cookies.get(CSRF_COOKIE) || '';
            if (!csrfCookie || csrfHeader !== csrfCookie) {
                return json({ error: 'Invalid CSRF token' }, { status: 403 });
            }
            const user = await provider.authorize(credentials);
            if (!user) {
                return json({ error: 'Invalid credentials' }, { status: 401 });
            }
            if (config.callbacks?.signIn && !(await config.callbacks.signIn({ user }))) {
                return json({ error: 'Access denied' }, { status: 403 });
            }
            const created = await createSessionCookie(config, user);
            const redirectTo = credentials.callbackUrl || url.searchParams.get('callbackUrl') || '/';
            const safeRedirect = await resolveRedirect(config, redirectTo, url.toString());
            return redirect(safeRedirect, [created.cookie]);
        }
        const { verifier, challenge } = (0, core_1.pkcePair)();
        const state = (0, core_1.randomToken)(16);
        const callbackUrl = url.searchParams.get('callbackUrl') || '/';
        const redirectUri = `${origin}${basePath}/callback/${provider.id}`;
        const params = new URLSearchParams({
            client_id: provider.clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            state,
            code_challenge: challenge,
            code_challenge_method: 'S256',
            ...provider.authorization.params,
        });
        return redirect(`${provider.authorization.url}?${params.toString()}`, [
            cookie(STATE_COOKIE, state, { maxAge: 600 }),
            cookie(PKCE_COOKIE, verifier, { maxAge: 600 }),
            cookie(CALLBACK_COOKIE, callbackUrl, { maxAge: 600 }),
        ]);
    }
    if (action === 'callback' && providerId) {
        const provider = findProvider(config, providerId);
        if (!provider || provider.type !== 'oauth') {
            return json({ error: 'Unknown provider' }, { status: 400 });
        }
        const state = url.searchParams.get('state');
        if (!state || state !== cookies.get(STATE_COOKIE)) {
            return json({ error: 'Invalid OAuth state' }, { status: 403 });
        }
        const code = url.searchParams.get('code');
        const verifier = cookies.get(PKCE_COOKIE);
        if (!code || !verifier) {
            return json({ error: 'Missing OAuth code' }, { status: 400 });
        }
        const redirectUri = `${origin}${basePath}/callback/${provider.id}`;
        const user = await exchangeOAuth(provider, code, redirectUri, verifier);
        if (config.adapter?.getUserByAccount) {
            const existing = await config.adapter.getUserByAccount(provider.id, user.id);
            if (existing) {
                user.id = existing.id;
            }
            else {
                await config.adapter.createUser?.(user);
                await config.adapter.linkAccount?.(user.id, {
                    provider: provider.id,
                    type: 'oauth',
                    providerAccountId: user.id,
                });
            }
        }
        if (config.callbacks?.signIn && !(await config.callbacks.signIn({ user }))) {
            return json({ error: 'Access denied' }, { status: 403 });
        }
        const created = await createSessionCookie(config, user);
        const callbackUrl = cookies.get(CALLBACK_COOKIE) || '/';
        const safeRedirect = await resolveRedirect(config, callbackUrl, url.toString());
        return redirect(safeRedirect, [
            created.cookie,
            expiredCookie(STATE_COOKIE),
            expiredCookie(PKCE_COOKIE),
            expiredCookie(CALLBACK_COOKIE),
        ]);
    }
    return json({ error: 'Not found' }, { status: 404 });
}
function VistaAuth(config) {
    const resolved = (0, core_1.resolveAuthConfig)(config);
    const handlers = {
        GET: (request) => handleAuthRequest(request, resolved),
        POST: (request) => handleAuthRequest(request, resolved),
    };
    async function auth(request) {
        if (request) {
            return readSessionFromRequest(request, resolved);
        }
        const context = (0, request_context_1.getRequestContext)();
        if (!context?.req)
            return null;
        const host = context.req.get?.('host') || context.req.headers?.host || 'localhost';
        const protocol = context.req.protocol || 'http';
        const headers = new Headers();
        if (context.req.headers?.cookie)
            headers.set('cookie', String(context.req.headers.cookie));
        const fake = new Request(`${protocol}://${host}${context.req.originalUrl || context.req.url || '/'}`, {
            headers,
        });
        return readSessionFromRequest(fake, resolved);
    }
    async function signIn(providerId, options = {}) {
        const context = (0, request_context_1.getRequestContext)();
        const host = context?.req?.get?.('host') || 'localhost';
        const protocol = context?.req?.protocol || 'http';
        if (providerId) {
            const provider = findProvider(resolved, providerId);
            if (provider?.type === 'credentials') {
                const user = await provider.authorize(options);
                if (!user) {
                    return json({ error: 'Invalid credentials' }, { status: 401 });
                }
                if (resolved.callbacks?.signIn && !(await resolved.callbacks.signIn({ user }))) {
                    return json({ error: 'Access denied' }, { status: 403 });
                }
                const created = await createSessionCookie(resolved, user);
                const requestUrl = `${protocol}://${host}/`;
                const safeRedirect = await resolveRedirect(resolved, options.callbackUrl || '/', requestUrl);
                return redirect(safeRedirect, [created.cookie]);
            }
        }
        const url = new URL(`${protocol}://${host}${resolved.basePath}/signin${providerId ? `/${providerId}` : ''}`);
        for (const [key, value] of Object.entries(options)) {
            url.searchParams.set(key, value);
        }
        const headers = new Headers();
        if (context?.req?.headers?.cookie)
            headers.set('cookie', String(context.req.headers.cookie));
        return handleAuthRequest(new Request(url, { method: 'GET', headers }), resolved);
    }
    async function signOut() {
        const context = (0, request_context_1.getRequestContext)();
        const host = context?.req?.get?.('host') || 'localhost';
        const protocol = context?.req?.protocol || 'http';
        return handleAuthRequest(new Request(`${protocol}://${host}${resolved.basePath}/signout`, { method: 'POST' }), resolved);
    }
    function authMiddleware(authorized) {
        const callback = authorized || resolved.callbacks?.authorized;
        return async ({ request, next }) => {
            const webRequest = request instanceof Request
                ? request
                : new Request(request.url, { headers: request.headers, method: request.method });
            const session = await readSessionFromRequest(webRequest, resolved);
            if (!callback) {
                return next();
            }
            const result = await callback({ auth: session, request: webRequest });
            if (result instanceof Response)
                return result;
            if (result === false) {
                const signInPage = resolved.pages?.signIn || `${resolved.basePath}/signin`;
                return new Response(null, { status: 307, headers: { Location: signInPage } });
            }
            return next();
        };
    }
    return { handlers, auth, signIn, signOut, authMiddleware, config: resolved };
}
exports.default = VistaAuth;
