import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  formatMs,
  runVistaBuild,
  runVistaDevEditBenchmark,
} from '../shared/vista-bench-runner.mjs';

const CWD = fileURLToPath(new URL('.', import.meta.url));
const [, , command = 'all'] = process.argv;

for (const testCase of [
  'client-components-only',
  'server-and-client-components',
  'server-components-only',
]) {
  console.log(`\n[${testCase}]`);

  if (command === 'dev' || command === 'all') {
    const result = await runVistaDevEditBenchmark({
      cwd: CWD,
      pagePath: `/page77/${testCase}`,
      filePath: join(CWD, 'app', 'page77', testCase, 'page.js'),
      token: 'Hello',
    });

    console.table([
      { metric: 'startup', 'time (ms)': Number(result.startupMs.toFixed(2)) },
      { metric: 'initial request', 'time (ms)': Number(result.initialRequestMs.toFixed(2)) },
      ...result.hmrMs.map((value, index) => ({
        metric: `hmr-${index + 1}`,
        'time (ms)': Number(value.toFixed(2)),
      })),
    ]);
  }

  if (command === 'build' || command === 'all') {
    const result = await runVistaBuild({ cwd: CWD });
    console.info('vista build duration:', formatMs(result.durationMs));
    console.info('vista build artifact:', '.vista/artifact-manifest.json');
  }
}
