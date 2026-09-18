/**
 * Middleware security primitives.
 *
 * These are Next-inspired helpers that apps can compose in `middleware.ts`.
 * The runner also uses the redirect/header sanitizers internally.
 */

export const FORBIDDEN_REQUEST_HEADERS = new Set([
  'host',
  'cookie',
  'content-length',
  'content-type',
  'transfer-encoding',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-real-ip',
  'x-middleware-next',
  'x-middleware-rewrite',
]);

export function isForbiddenRequestHeader(name: string): boolean {
  return FORBIDDEN_REQUEST_HEADERS.has(name.toLowerCase());
}

export function sanitizeRequestHeaderMap(
  headers: Map<string, string> | Headers | Record<string, string>
): Map<string, string> {
  const sanitized = new Map<string, string>();
  const append = (key: string, value: string) => {
    if (!isForbiddenRequestHeader(key)) {
      sanitized.set(key.toLowerCase(), value);
    }
  };

  if (headers instanceof Map) {
    headers.forEach((value, key) => append(key, value));
  } else if (typeof (headers as Headers).forEach === 'function' && !Array.isArray(headers)) {
    (headers as Headers).forEach((value, key) => append(key, value));
  } else {
    for (const [key, value] of Object.entries(headers as Record<string, string>)) {
      append(key, value);
    }
  }

  return sanitized;
}

export function isSafeRedirectLocation(
  location: string,
  requestUrl: string,
  allowedHosts: string[] = []
): boolean {
  const trimmed = String(location || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
    return !trimmed.includes('://');
  }

  try {
    const base = new URL(requestUrl);
    const target = new URL(trimmed, base);
    if (target.origin === base.origin) {
      return true;
    }
    const allowed = new Set(allowedHosts.map((host) => host.toLowerCase()));
    return allowed.has(target.host.toLowerCase());
  } catch {
    return false;
  }
}

export function isSafeRewriteLocation(location: string): boolean {
  const trimmed = String(location || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
    return !trimmed.includes('://');
  }
  return false;
}

export function securityHeaders(init: ResponseInit = {}): Headers {
  const headers = new Headers(init.headers);
  if (!headers.has('X-Content-Type-Options')) headers.set('X-Content-Type-Options', 'nosniff');
  if (!headers.has('X-Frame-Options')) headers.set('X-Frame-Options', 'DENY');
  if (!headers.has('Referrer-Policy')) headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!headers.has('X-DNS-Prefetch-Control')) headers.set('X-DNS-Prefetch-Control', 'off');
  if (!headers.has('Permissions-Policy')) {
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  }
  if (process.env.NODE_ENV === 'production' && !headers.has('Strict-Transport-Security')) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return headers;
}

export function cors(options: {
  origin?: string | string[] | '*';
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
  maxAge?: number;
} = {}): (request: Request) => Headers {
  const origin = options.origin ?? '*';
  const methods = (options.methods ?? ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).join(', ');
  const allowHeaders = (options.headers ?? ['Content-Type', 'Authorization']).join(', ');

  return (request: Request) => {
    const headers = new Headers();
    const requestOrigin = request.headers.get('origin');
    if (origin === '*') {
      headers.set('Access-Control-Allow-Origin', '*');
    } else if (Array.isArray(origin)) {
      if (requestOrigin && origin.includes(requestOrigin)) {
        headers.set('Access-Control-Allow-Origin', requestOrigin);
        headers.set('Vary', 'Origin');
      }
    } else if (origin) {
      headers.set('Access-Control-Allow-Origin', origin);
    }
    headers.set('Access-Control-Allow-Methods', methods);
    headers.set('Access-Control-Allow-Headers', allowHeaders);
    if (options.credentials) {
      headers.set('Access-Control-Allow-Credentials', 'true');
    }
    if (options.maxAge != null) {
      headers.set('Access-Control-Max-Age', String(options.maxAge));
    }
    return headers;
  };
}

interface RateLimitBucket {
  tokens: number;
  updatedAt: number;
}

const rateLimitStores = new Map<string, Map<string, RateLimitBucket>>();

export function rateLimit(options: {
  key?: string;
  limit?: number;
  windowMs?: number;
  identifier?: (request: { headers: Headers; ip?: string }) => string;
} = {}) {
  const limit = options.limit ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const storeKey = options.key ?? 'default';
  if (!rateLimitStores.has(storeKey)) {
    rateLimitStores.set(storeKey, new Map());
  }
  const store = rateLimitStores.get(storeKey)!;

  return (request: { headers: Headers; ip?: string }): { ok: boolean; remaining: number } => {
    const identifier =
      options.identifier?.(request) ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.ip ||
      'anonymous';
    const now = Date.now();
    const bucket = store.get(identifier) || { tokens: limit, updatedAt: now };
    const elapsed = now - bucket.updatedAt;
    const refill = (elapsed / windowMs) * limit;
    bucket.tokens = Math.min(limit, bucket.tokens + refill);
    bucket.updatedAt = now;
    if (bucket.tokens < 1) {
      store.set(identifier, bucket);
      return { ok: false, remaining: 0 };
    }
    bucket.tokens -= 1;
    store.set(identifier, bucket);
    return { ok: true, remaining: Math.floor(bucket.tokens) };
  };
}

export type MiddlewareLike = (context: any) => Promise<Response | void> | Response | void;

export function chain(middlewares: MiddlewareLike[]): MiddlewareLike {
  return async (context) => {
    const originalNext = context.next;
    let index = -1;

    const dispatch = async (current: number): Promise<Response> => {
      if (current <= index) {
        throw new Error('next() called multiple times');
      }
      index = current;
      const fn = middlewares[current];
      if (!fn) {
        return originalNext();
      }
      const next = async () => dispatch(current + 1);
      const result = await fn({ ...context, next });
      if (result instanceof Response) {
        return result;
      }
      return next();
    };

    return dispatch(0);
  };
}
