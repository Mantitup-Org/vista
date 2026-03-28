/**
 * Vista Server Utilities
 *
 * Next.js-compatible server-only functions for use in Server Components and API routes.
 * These functions only work on the server side.
 */

import { getRequestContext } from './request-context';

function parseCookieHeader(header: string | undefined): Map<string, string> {
    const cookieMap = new Map<string, string>();

    if (!header) {
        return cookieMap;
    }

    for (const segment of header.split(';')) {
        const [rawName, ...valueParts] = segment.split('=');
        const name = rawName?.trim();
        if (!name) continue;
        cookieMap.set(name, decodeURIComponent(valueParts.join('=').trim()));
    }

    return cookieMap;
}

function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
    const parts = [`${name}=${encodeURIComponent(value)}`];

    if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
    if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
    if (options.domain) parts.push(`Domain=${options.domain}`);
    parts.push(`Path=${options.path || '/'}`);
    if (options.secure) parts.push('Secure');
    if (options.httpOnly) parts.push('HttpOnly');
    if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
    if (options.priority) parts.push(`Priority=${options.priority}`);

    return parts.join('; ');
}

function appendSetCookie(serializedCookie: string): void {
    const res = getRequestContext()?.res;
    if (!res) {
        return;
    }

    const current = res.getHeader('Set-Cookie');
    if (!current) {
        res.setHeader('Set-Cookie', [serializedCookie]);
        return;
    }

    if (Array.isArray(current)) {
        res.setHeader('Set-Cookie', [...current.map((entry) => String(entry)), serializedCookie]);
        return;
    }

    res.setHeader('Set-Cookie', [String(current), serializedCookie]);
}

function createCookieStore(): CookieStore {
    const request = getRequestContext()?.req;
    const cookieMap = parseCookieHeader(request?.headers?.cookie as string | undefined);

    const syncRequestCookieHeader = (): void => {
        if (!request || !request.headers) {
            return;
        }

        request.headers.cookie = Array.from(cookieMap.entries())
            .map(([name, cookieValue]) => `${name}=${encodeURIComponent(cookieValue)}`)
            .join('; ');
    };

    return {
        get(name: string): ReadonlyCookie | undefined {
            const value = cookieMap.get(name);
            return value === undefined ? undefined : { name, value };
        },
        getAll(): ReadonlyCookie[] {
            return Array.from(cookieMap.entries()).map(([name, value]) => ({ name, value }));
        },
        has(name: string): boolean {
            return cookieMap.has(name);
        },
        set(name: string, value: string, options?: CookieOptions): void {
            cookieMap.set(name, value);
            syncRequestCookieHeader();
            appendSetCookie(serializeCookie(name, value, options));
        },
        delete(name: string): void {
            cookieMap.delete(name);
            syncRequestCookieHeader();
            appendSetCookie(
                serializeCookie(name, '', {
                    expires: new Date(0),
                    maxAge: 0,
                    path: '/',
                })
            );
        },
    };
}

function createReadonlyHeaders(): ReadonlyHeaders {
    const request = getRequestContext()?.req;
    const headerMap = new Map<string, string>();

    if (request?.headers) {
        for (const [key, value] of Object.entries(request.headers)) {
            if (Array.isArray(value)) {
                headerMap.set(key.toLowerCase(), value.join(', '));
                continue;
            }
            if (value !== undefined) {
                headerMap.set(key.toLowerCase(), String(value));
            }
        }
    }

    return {
        get(name: string): string | null {
            return headerMap.get(name.toLowerCase()) ?? null;
        },
        has(name: string): boolean {
            return headerMap.has(name.toLowerCase());
        },
        entries(): IterableIterator<[string, string]> {
            return headerMap.entries();
        },
        keys(): IterableIterator<string> {
            return headerMap.keys();
        },
        values(): IterableIterator<string> {
            return headerMap.values();
        },
        forEach(callback: (value: string, key: string) => void): void {
            headerMap.forEach((value, key) => callback(value, key));
        },
    };
}

// ============================================================================
// Cookies
// ============================================================================

export interface CookieOptions {
    maxAge?: number;
    expires?: Date;
    path?: string;
    domain?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    priority?: 'low' | 'medium' | 'high';
}

export interface ReadonlyCookie {
    name: string;
    value: string;
}

export interface CookieStore {
    get(name: string): ReadonlyCookie | undefined;
    getAll(): ReadonlyCookie[];
    has(name: string): boolean;
    set(name: string, value: string, options?: CookieOptions): void;
    delete(name: string): void;
}

/**
 * Access cookies in Server Components and API routes.
 * Note: This is a simplified implementation - in production, integrate with actual request.
 */
export function cookies(): CookieStore {
    // Check if we're in a server context
    if (typeof window !== 'undefined') {
        console.warn('cookies() should only be called on the server');
    }

    return createCookieStore();
}

// ============================================================================
// Headers
// ============================================================================

export interface ReadonlyHeaders {
    get(name: string): string | null;
    has(name: string): boolean;
    entries(): IterableIterator<[string, string]>;
    keys(): IterableIterator<string>;
    values(): IterableIterator<string>;
    forEach(callback: (value: string, key: string) => void): void;
}

/**
 * Access request headers in Server Components.
 * Note: This is a simplified implementation - in production, integrate with actual request.
 */
export function headers(): ReadonlyHeaders {
    if (typeof window !== 'undefined') {
        console.warn('headers() should only be called on the server');
    }

    return createReadonlyHeaders();
}

// ============================================================================
// Draft Mode
// ============================================================================

const DRAFT_MODE_COOKIE = '__vista_draft_mode';

export interface DraftMode {
    isEnabled: boolean;
    enable(): void;
    disable(): void;
}

export function draftMode(): DraftMode {
    const store = cookies();

    return {
        get isEnabled() {
            return store.has(DRAFT_MODE_COOKIE);
        },
        enable(): void {
            store.set(DRAFT_MODE_COOKIE, '1', {
                httpOnly: true,
                path: '/',
                sameSite: 'lax',
            });
        },
        disable(): void {
            store.delete(DRAFT_MODE_COOKIE);
        },
    };
}

// ============================================================================
// Redirect
// ============================================================================

export type RedirectType = 'push' | 'replace';

export class RedirectError extends Error {
    public readonly url: string;
    public readonly type: RedirectType;

    constructor(url: string, type: RedirectType = 'replace') {
        super(`Redirect to ${url}`);
        this.name = 'RedirectError';
        this.url = url;
        this.type = type;
    }
}

/**
 * Redirect to another URL from a Server Component or API route.
 * @param url - The URL to redirect to
 * @param type - The type of redirect ('push' or 'replace')
 * @throws RedirectError - Always throws to interrupt rendering
 */
export function redirect(url: string, type: RedirectType = 'replace'): never {
    throw new RedirectError(url, type);
}

/**
 * Permanent redirect (HTTP 308) to another URL.
 * @param url - The URL to redirect to
 * @throws RedirectError - Always throws to interrupt rendering
 */
export function permanentRedirect(url: string): never {
    throw new RedirectError(url, 'replace');
}

// ============================================================================
// Not Found
// ============================================================================

export class NotFoundError extends Error {
    constructor() {
        super('Not Found');
        this.name = 'NotFoundError';
    }
}

/**
 * Trigger a 404 Not Found response from a Server Component.
 * @throws NotFoundError - Always throws to interrupt rendering
 */
export function notFound(): never {
    throw new NotFoundError();
}

// ============================================================================
// Response Helpers
// ============================================================================

/**
 * Create a JSON response (for API routes).
 */
export function json<T>(data: T, init?: ResponseInit): Response {
    return new Response(JSON.stringify(data), {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...init?.headers,
        },
    });
}

/**
 * Create a NextResponse-compatible response object.
 */
export class NextResponse extends Response {
    static json<T>(data: T, init?: ResponseInit): NextResponse {
        return new NextResponse(JSON.stringify(data), {
            ...init,
            headers: {
                'Content-Type': 'application/json',
                ...init?.headers,
            },
        });
    }

    static redirect(url: string | URL, status: number = 307): NextResponse {
        return new NextResponse(null, {
            status,
            headers: {
                Location: url.toString(),
            },
        });
    }

    static rewrite(url: string | URL): NextResponse {
        // Rewrite implementation would go here
        return new NextResponse(null, {
            headers: {
                'x-middleware-rewrite': url.toString(),
            },
        });
    }

    static next(): NextResponse {
        return new NextResponse(null, {
            headers: {
                'x-middleware-next': '1',
            },
        });
    }
}

// ============================================================================
// Request Helpers
// ============================================================================

export interface NextRequest extends Request {
    nextUrl: {
        pathname: string;
        searchParams: URLSearchParams;
        href: string;
        origin: string;
    };
    cookies: CookieStore;
    headers: Headers;
}

export { cacheLife, cacheTag, revalidatePath, revalidateTag, unstable_cache } from './cache';
