"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCliAvailable = isCliAvailable;
exports.runCliCommand = runCliCommand;
exports.extractDeploymentUrl = extractDeploymentUrl;
const child_process_1 = require("child_process");
function parseCommand(command) {
    const parts = command.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
        throw new Error('[vista:deploy] Empty CLI command.');
    }
    return { bin: parts[0], args: parts.slice(1) };
}
function isCliAvailable(command) {
    const { bin } = parseCommand(command);
    const which = process.platform === 'win32' ? 'where' : 'which';
    const result = (0, child_process_1.spawnSync)(which, [bin], { stdio: 'ignore' });
    return result.status === 0;
}
function runCliCommand(command, options) {
    if (options.dryRun) {
        return {
            ok: true,
            stdout: '',
            stderr: '',
            command,
        };
    }
    const { bin, args } = parseCommand(command);
    if (!isCliAvailable(bin)) {
        return {
            ok: false,
            stdout: '',
            stderr: `CLI not found: ${bin}`,
            command,
            missingCli: true,
        };
    }
    const result = (0, child_process_1.spawnSync)(bin, args, {
        cwd: options.cwd,
        env: { ...process.env, ...(options.env ?? {}) },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
        ok: result.status === 0,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        command,
        missingCli: false,
    };
}
function extractDeploymentUrl(output) {
    const match = output.match(/https?:\/\/[^\s]+/g);
    if (!match || match.length === 0)
        return undefined;
    return match[match.length - 1].replace(/[)\]'"]+$/, '');
}
