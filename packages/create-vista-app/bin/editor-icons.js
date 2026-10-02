const fs = require('fs');
const os = require('os');
const path = require('path');

// VS Code and Cursor do not load explorer icons from node_modules.
// Material Icon Theme only shows a custom SVG when the file sits in the
// user's extensions directory and User settings point at it.
const FILE_ASSOCIATIONS = {
  'vista.config.ts': '../../icons/vista',
  'vista.config.js': '../../icons/vista',
  'vista.config.mjs': '../../icons/vista',
};

const FOLDER_ASSOCIATIONS = {
  '.flash': '../../../../icons/folder-flash',
  flashpack: '../../../../icons/folder-flash',
  '.vista': '../../../../icons/vista-folder',
};

const ICON_FILES = [
  'vista.svg',
  'flash.svg',
  'folder-flash.svg',
  'folder-flash-open.svg',
  'vista-folder.svg',
  'vista-folder-open.svg',
];

function editorTargets() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return [
      {
        name: 'Cursor',
        userDir: path.join(appData, 'Cursor', 'User'),
        iconsDir: path.join(home, '.cursor', 'extensions', 'icons'),
      },
      {
        name: 'VS Code',
        userDir: path.join(appData, 'Code', 'User'),
        iconsDir: path.join(home, '.vscode', 'extensions', 'icons'),
      },
    ];
  }

  if (process.platform === 'darwin') {
    const support = path.join(home, 'Library', 'Application Support');
    return [
      {
        name: 'Cursor',
        userDir: path.join(support, 'Cursor', 'User'),
        iconsDir: path.join(home, '.cursor', 'extensions', 'icons'),
      },
      {
        name: 'VS Code',
        userDir: path.join(support, 'Code', 'User'),
        iconsDir: path.join(home, '.vscode', 'extensions', 'icons'),
      },
    ];
  }

  const configHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return [
    {
      name: 'Cursor',
      userDir: path.join(configHome, 'Cursor', 'User'),
      iconsDir: path.join(home, '.cursor', 'extensions', 'icons'),
    },
    {
      name: 'VS Code',
      userDir: path.join(configHome, 'Code', 'User'),
      iconsDir: path.join(home, '.vscode', 'extensions', 'icons'),
    },
  ];
}

function skipComment(source, index) {
  const next = source[index + 1];
  if (source[index] === '/' && next === '/') {
    let i = index + 2;
    while (i < source.length && source[i] !== '\n') i += 1;
    return i;
  }
  if (source[index] === '/' && next === '*') {
    let i = index + 2;
    while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
    return Math.min(source.length, i + 2);
  }
  return index;
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = openIndex; i < source.length; i += 1) {
    if (!inString) {
      const skipped = skipComment(source, i);
      if (skipped !== i) {
        i = skipped - 1;
        continue;
      }
    }

    const char = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function findRootObject(source) {
  for (let i = 0; i < source.length; i += 1) {
    const skipped = skipComment(source, i);
    if (skipped !== i) {
      i = skipped - 1;
      continue;
    }
    if (source[i] === '{') {
      const close = findMatchingBrace(source, i);
      if (close === -1) return null;
      return { open: i, close };
    }
  }
  return null;
}

function findProperty(source, open, close, propertyName) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = open + 1; i < close; i += 1) {
    if (!inString && depth === 0) {
      const skipped = skipComment(source, i);
      if (skipped !== i) {
        i = skipped - 1;
        continue;
      }
    }

    const char = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      if (depth === 0) {
        const keyEnd = source.indexOf('"', i + 1);
        if (keyEnd === -1) return null;
        const key = source.slice(i + 1, keyEnd);
        let cursor = keyEnd + 1;
        while (cursor < close && /\s/.test(source[cursor])) cursor += 1;
        if (source[cursor] === ':' && key === propertyName) {
          cursor += 1;
          while (cursor < close && /\s/.test(source[cursor])) cursor += 1;
          return { keyStart: i, valueStart: cursor };
        }
        i = keyEnd;
        continue;
      }
      inString = true;
      continue;
    }

    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
  }

  return null;
}

function detectIndent(source) {
  const match = source.match(/\n([ \t]+)"/);
  return match ? match[1] : '    ';
}

function needsCommaBefore(source, index) {
  let i = index - 1;
  while (i >= 0 && /\s/.test(source[i])) i -= 1;
  if (i < 0) return false;
  return source[i] !== '{' && source[i] !== ',';
}

function formatObject(entries, indent) {
  const child = `${indent}${indent}`;
  const lines = Object.entries(entries).map(
    ([key, value]) => `${child}${JSON.stringify(key)}: ${JSON.stringify(value)}`
  );
  if (lines.length === 0) return '{}';
  return `{\n${lines.join(',\n')}\n${indent}}`;
}

function insertObjectProperty(source, close, propertyName, entries, indent) {
  const head = source.slice(0, close).replace(/\s*$/, '');
  const comma = needsCommaBefore(head, head.length) ? ',' : '';
  const block = `${comma}\n${indent}${JSON.stringify(propertyName)}: ${formatObject(entries, indent)}\n`;
  return head + block + source.slice(close);
}

function replaceStringValue(source, valueStart, nextValue) {
  if (source[valueStart] !== '"') return null;
  let i = valueStart + 1;
  let escaped = false;
  while (i < source.length) {
    const char = source[i];
    if (escaped) {
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '"') {
      const encoded = JSON.stringify(nextValue);
      return source.slice(0, valueStart) + encoded + source.slice(i + 1);
    }
    i += 1;
  }
  return null;
}

function insertStringProperty(source, close, key, value, indent) {
  const head = source.slice(0, close).replace(/\s*$/, '');
  const comma = needsCommaBefore(head, head.length) ? ',' : '';
  const line = `${comma}\n${indent}${indent}${JSON.stringify(key)}: ${JSON.stringify(value)}`;
  return `${head}${line}\n${indent}${source.slice(close)}`;
}

function upsertStringMap(source, propertyName, entries) {
  const root = findRootObject(source);
  if (!root) {
    const indent = '    ';
    return `{\n${indent}${JSON.stringify(propertyName)}: ${formatObject(entries, indent)}\n}\n`;
  }

  const indent = detectIndent(source);
  let next = source;
  let container = findProperty(next, root.open, root.close, propertyName);

  if (!container || next[container.valueStart] !== '{') {
    if (container) {
      const valueClose = findMatchingBrace(next, container.valueStart);
      if (next[container.valueStart] === '{' && valueClose !== -1) {
        container = { ...container, valueClose };
      } else {
        return next;
      }
    } else {
      return insertObjectProperty(next, root.close, propertyName, entries, indent);
    }
  }

  const valueOpen = container.valueStart;
  let valueClose = findMatchingBrace(next, valueOpen);
  if (valueClose === -1) return next;

  for (const [key, value] of Object.entries(entries)) {
    const existing = findProperty(next, valueOpen, valueClose, key);
    if (existing && next[existing.valueStart] === '"') {
      const replaced = replaceStringValue(next, existing.valueStart, value);
      if (replaced) next = replaced;
    } else if (!existing) {
      next = insertStringProperty(next, valueClose, key, value, indent);
    }
    const refreshedRoot = findRootObject(next);
    if (!refreshedRoot) return next;
    const refreshed = findProperty(next, refreshedRoot.open, refreshedRoot.close, propertyName);
    if (!refreshed || next[refreshed.valueStart] !== '{') return next;
    valueClose = findMatchingBrace(next, refreshed.valueStart);
    if (valueClose === -1) return next;
  }

  return next;
}

function applyEditorIconSettings(source) {
  const withFiles = upsertStringMap(
    source,
    'material-icon-theme.files.associations',
    FILE_ASSOCIATIONS
  );
  return upsertStringMap(withFiles, 'material-icon-theme.folders.associations', FOLDER_ASSOCIATIONS);
}

function copyIcons(iconsDir) {
  const sourceDir = path.join(__dirname, '..', 'file-icons');
  fs.mkdirSync(iconsDir, { recursive: true });
  for (const fileName of ICON_FILES) {
    fs.copyFileSync(path.join(sourceDir, fileName), path.join(iconsDir, fileName));
  }
}

function installEditorIcons() {
  const installed = [];
  for (const target of editorTargets()) {
    if (!fs.existsSync(target.userDir)) continue;
    copyIcons(target.iconsDir);
    const settingsPath = path.join(target.userDir, 'settings.json');
    const current = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf8') : '{\n}\n';
    const next = applyEditorIconSettings(current);
    if (next !== current) fs.writeFileSync(settingsPath, next);
    installed.push(target.name);
  }
  return installed;
}

module.exports = {
  FILE_ASSOCIATIONS,
  FOLDER_ASSOCIATIONS,
  applyEditorIconSettings,
  installEditorIcons,
};
