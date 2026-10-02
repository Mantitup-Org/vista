import path from 'node:path';
import { pathToFileURL } from 'node:url';

let modulesDir = '';
let shimsDir = '';

export function initialize(data) {
  modulesDir = data.modulesDir;
  shimsDir = data.shimsDir;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('/_flashpack/modules/')) {
    const rel = specifier.slice('/_flashpack/modules/'.length).split('?')[0];
    return {
      url: pathToFileURL(path.join(modulesDir, ...rel.split('/'))).href,
      shortCircuit: true,
    };
  }

  if (specifier.startsWith('/_flashpack/shims/')) {
    const name = specifier.slice('/_flashpack/shims/'.length).split('?')[0];
    return {
      url: pathToFileURL(path.join(shimsDir, name)).href,
      shortCircuit: true,
    };
  }

  if (specifier === '/_flashpack/empty.js') {
    return {
      url: pathToFileURL(path.join(shimsDir, 'empty.js')).href,
      shortCircuit: true,
    };
  }

  if (specifier.startsWith('/_flashpack/mod/')) {
    const spec = decodeURIComponent(specifier.slice('/_flashpack/mod/'.length));
    return nextResolve(spec, context);
  }

  return nextResolve(specifier, context);
}
