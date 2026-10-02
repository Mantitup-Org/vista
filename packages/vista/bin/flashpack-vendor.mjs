import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const cwd = path.resolve(process.argv[2] || '');
const spec = process.argv[3] || '';
const outfile = path.resolve(process.argv[4] || '');

function loadEsbuild() {
  const bases = [cwd, path.resolve(cwd, '../..'), path.resolve(cwd, '../../..')];
  for (const base of bases) {
    try {
      return createRequire(path.join(base, 'package.json'))('esbuild');
    } catch {
      // try the next root
    }
  }
  const pnpm = path.resolve(cwd, '../../node_modules/.pnpm');
  if (!fs.existsSync(pnpm)) {
    throw new Error('esbuild is not installed');
  }
  const versions = fs.readdirSync(pnpm).filter((name) => name.startsWith('esbuild@')).sort();
  const version = versions.at(-1);
  if (!version) throw new Error('esbuild is not installed');
  return createRequire(path.join(pnpm, version, 'node_modules', 'esbuild', 'package.json'))('esbuild');
}

function namedExports(specifier) {
  try {
    const loaded = createRequire(path.join(cwd, 'package.json'))(specifier);
    const source = loaded && (typeof loaded === 'object' || typeof loaded === 'function') ? loaded : {};
    return Object.keys(source).filter(
      (name) => name !== 'default' && name !== '__esModule' && /^[A-Za-z_$][\w$]*$/.test(name)
    );
  } catch {
    return [];
  }
}

const reactGlobals = {
  react: '__VISTA_REACT__',
  'react-dom': '__VISTA_REACT_DOM__',
  'react-dom/client': '__VISTA_REACT_DOM_CLIENT__',
  'react/jsx-runtime': '__VISTA_JSX__',
  'react/jsx-dev-runtime': '__VISTA_JSX_DEV__',
};

function writeReactShim(specifier, file) {
  const globalName = reactGlobals[specifier];
  const lines = namedExports(specifier).map(
    (name) => `export const ${name} = ns[${JSON.stringify(name)}];`
  );
  fs.writeFileSync(
    file,
    `const ns = window[${JSON.stringify(globalName)}];\n${lines.join('\n')}\nexport default ns;\n`
  );
}

const esbuild = loadEsbuild();
if (reactGlobals[spec]) {
  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  writeReactShim(spec, outfile);
  process.exit(0);
}
const exportLines = namedExports(spec).map(
  (name) => `export const ${name} = namespace[${JSON.stringify(name)}];`
);
fs.mkdirSync(path.dirname(outfile), { recursive: true });
await esbuild.build({
  absWorkingDir: cwd,
  stdin: {
    contents: `import * as namespace from ${JSON.stringify(spec)};\n${exportLines.join('\n')}\nexport default namespace.default ?? namespace;\n`,
    resolveDir: cwd,
    sourcefile: 'flashpack-vendor.js',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  outfile,
  logLevel: 'silent',
  define: {
    'process.env.NODE_ENV': '"development"',
  },
  mainFields: ['browser', 'module', 'main'],
  plugins: [
    {
      name: 'vista-shared-react',
      setup(build) {
        build.onResolve({ filter: /^react($|\/)|^react-dom($|\/)/ }, (args) => {
          if (!Object.prototype.hasOwnProperty.call(reactGlobals, args.path)) return null;
          return { path: `/_flashpack/mod/${args.path}`, external: true };
        });
      },
    },
  ],
});
