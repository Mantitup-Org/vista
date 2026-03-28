const { spawn } = require('node:child_process');

function isPermissionDenied(error) {
  return error && (error.code === 'EPERM' || error.code === 'EACCES');
}

function quoteWindowsArg(value) {
  const text = String(value);
  if (!/[\s"]/u.test(text)) {
    return text;
  }

  return `"${text
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\+)$/g, '$1$1')}"`;
}

function quotePosixArg(value) {
  const text = String(value);
  if (!/[\s'"\\$`]/u.test(text)) {
    return text;
  }

  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function buildShellFallback(command, args) {
  if (process.platform === 'win32') {
    const comspec = process.env.ComSpec || 'cmd.exe';
    const commandLine = [command, ...args].map(quoteWindowsArg).join(' ');
    return {
      command: comspec,
      args: ['/d', '/s', '/c', commandLine],
    };
  }

  const shell = process.env.SHELL || '/bin/sh';
  const commandLine = [command, ...args].map(quotePosixArg).join(' ');
  return {
    command: shell,
    args: ['-lc', commandLine],
  };
}

function spawnWithFallback(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const start = (nextCommand, nextArgs, usedFallback) => {
      let child;

      try {
        child = spawn(nextCommand, nextArgs, options);
      } catch (error) {
        if (!usedFallback && isPermissionDenied(error)) {
          const fallback = buildShellFallback(command, args);
          start(fallback.command, fallback.args, true);
          return;
        }
        reject(error);
        return;
      }

      const handleSpawn = () => {
        child.removeListener('error', handleError);
        resolve(child);
      };

      const handleError = (error) => {
        child.removeListener('spawn', handleSpawn);
        if (!usedFallback && isPermissionDenied(error)) {
          const fallback = buildShellFallback(command, args);
          start(fallback.command, fallback.args, true);
          return;
        }
        reject(error);
      };

      child.once('spawn', handleSpawn);
      child.once('error', handleError);
    };

    start(command, args, false);
  });
}

module.exports = {
  spawnWithFallback,
};
