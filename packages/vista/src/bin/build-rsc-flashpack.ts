import { buildRSC as buildRSCCore } from './build-rsc';
import { prepareFlashpackRuntime } from '../flashpack/runtime';

function resolveMode(watch: boolean): 'development' | 'production' {
  if (watch) return 'development';
  return process.env.NODE_ENV === 'development' ? 'development' : 'production';
}

export async function buildRSCFlashpack(
  watch: boolean = false
): ReturnType<typeof buildRSCCore> {
  const cwd = process.cwd();
  const mode = resolveMode(watch);
  const strict = process.env.VISTA_FLASHPACK_STRICT !== 'false';
  const phase = watch ? 'dev' : 'build';
  const prepared = prepareFlashpackRuntime({
    cwd,
    phase,
    mode,
    allowFallback: !strict,
  });

  if (!prepared.rustPipelineUsed) {
    if (strict) {
      throw new Error(
        '[flashpack] Rust pipeline did not run during build. Refusing silent non-Rust Flight prep (set VISTA_FLASHPACK_STRICT=false for explicit fallback).'
      );
    }
    console.warn(
      '[flashpack] WARNING: Rust pipeline skipped during build — webpack will still emit Flight/SSR manifests (explicit fallback, not renderToString).'
    );
  }

  if (process.env.VISTA_DEBUG) {
    console.log(
      `[flashpack] runtime prepared (rust=${prepared.rustPipelineUsed ? 'on' : 'fallback'}) at ${prepared.flashDir}`
    );
  }

  return buildRSCCore(watch);
}

export const buildRSC = buildRSCFlashpack;
export default buildRSCFlashpack;
