import { prepareFlashpackRuntime } from '../flashpack/runtime';
import { startRSCServer as startRSCCoreServer, type RSCEngineOptions } from './rsc-engine';

function resolveMode(): 'development' | 'production' {
  return process.env.NODE_ENV === 'development' ? 'development' : 'production';
}

export function startFlashpackRSCServer(options: RSCEngineOptions = {}): void {
  const cwd = process.cwd();
  const mode = resolveMode();
  const phase = mode === 'development' ? 'dev' : 'start';
  const strict = process.env.VISTA_FLASHPACK_STRICT !== 'false';

  const prepared = prepareFlashpackRuntime({
    cwd,
    phase,
    mode,
    allowFallback: !strict,
  });

  if (!prepared.rustPipelineUsed) {
    if (strict) {
      throw new Error(
        '[flashpack] Rust pipeline did not run. Refusing to start Flight SSR without Flashpack prep (set VISTA_FLASHPACK_STRICT=false for an explicit non-Rust fallback).'
      );
    }
    console.warn(
      '[flashpack] WARNING: Rust pipeline skipped — serving via webpack Flight SSR fallback (not a silent renderToString path).'
    );
  }

  if (process.env.VISTA_DEBUG) {
    console.log(
      `[flashpack] server runtime prepared (rust=${prepared.rustPipelineUsed ? 'on' : 'fallback'}) at ${prepared.flashDir}`
    );
  }

  // Same Flight SSR contract as webpack: inline Flight, React.use streaming, fail-closed.
  startRSCCoreServer(options);
}

export const startRSCServer = startFlashpackRSCServer;
export { startFlashpackRSCServer as default };
