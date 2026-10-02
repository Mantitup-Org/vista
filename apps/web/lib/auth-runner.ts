export type AuthRunResult =
  | {
      ok: true;
      meta: string;
      allowed: boolean;
      body: {
        path: string;
        session: 'present' | 'missing';
        decision: 'allow' | 'deny';
        reason: string;
      };
    }
  | {
      ok: false;
      error: string;
      meta?: string;
    };

/** In-browser simulation of fail-closed authMiddleware for the marketing playground. */
export function runAuthPlayground(options: {
  middlewareSource: string;
  configSource: string;
  path: string;
  signedIn: boolean;
}): AuthRunResult {
  const path = options.path.trim() || '/';
  if (!/VistaAuth\s*\(/.test(options.configSource) && !/authMiddleware/.test(options.configSource)) {
    return {
      ok: false,
      error: 'auth.ts should export VistaAuth({ ... }) with authMiddleware.',
      meta: 'parse auth',
    };
  }

  if (!/authMiddleware\s*\(/.test(options.middlewareSource)) {
    return {
      ok: false,
      error: 'middleware.ts must call authMiddleware(...).',
      meta: 'parse middleware',
    };
  }

  // Detect protected prefix from common scaffold pattern: startsWith('/account')
  const protectedMatch = options.middlewareSource.match(
    /startsWith\(\s*['"](\/[^'"]+)['"]\s*\)/
  );
  const protectedPrefix = protectedMatch?.[1] ?? '/account';
  const requiresAuth = path === protectedPrefix || path.startsWith(`${protectedPrefix}/`);
  const denyWhenMissing = /!\s*auth/.test(options.middlewareSource) || /!auth/.test(options.middlewareSource);

  let allowed = true;
  let reason = 'Middleware returned true for this path.';

  if (requiresAuth && denyWhenMissing && !options.signedIn) {
    allowed = false;
    reason = `No session — fail closed on ${protectedPrefix}.`;
  } else if (requiresAuth && options.signedIn) {
    reason = `Session present — ${protectedPrefix} is allowed.`;
  } else if (!requiresAuth) {
    reason = `${path} is outside the protected prefix (${protectedPrefix}).`;
  }

  return {
    ok: true,
    meta: `middleware · ${path}`,
    allowed,
    body: {
      path,
      session: options.signedIn ? 'present' : 'missing',
      decision: allowed ? 'allow' : 'deny',
      reason,
    },
  };
}
