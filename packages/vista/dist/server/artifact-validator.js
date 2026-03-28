"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateVistaArtifacts = validateVistaArtifacts;
exports.assertVistaArtifacts = assertVistaArtifacts;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("../constants");
const BASE_REQUIRED_FILES = [
    'BUILD_ID',
    'artifact-manifest.json',
    'build-manifest.json',
    'routes-manifest.json',
    'app-path-routes-manifest.json',
    'prerender-manifest.json',
    'required-server-files.json',
    'react-client-manifest.json',
    'react-server-manifest.json',
];
const RSC_REQUIRED_FILES = [
    ...BASE_REQUIRED_FILES,
    path_1.default.join('server', 'server-manifest.json'),
    path_1.default.join('server', 'runtime-manifest.json'),
    path_1.default.join('server', 'file-trace.json'),
    path_1.default.join('standalone', 'server.js'),
];
const LEGACY_REQUIRED_FILES = [...BASE_REQUIRED_FILES, 'client.js'];
function readJsonSafe(absolutePath) {
    try {
        return JSON.parse(fs_1.default.readFileSync(absolutePath, 'utf-8'));
    }
    catch {
        return null;
    }
}
function validateVistaArtifacts(cwd, mode) {
    const vistaDir = path_1.default.join(cwd, constants_1.BUILD_DIR);
    const missing = [];
    const requiredFiles = mode === 'rsc' ? RSC_REQUIRED_FILES : LEGACY_REQUIRED_FILES;
    if (!fs_1.default.existsSync(vistaDir)) {
        return [`${constants_1.BUILD_DIR} directory is missing`];
    }
    for (const relativePath of requiredFiles) {
        const absolutePath = path_1.default.join(vistaDir, relativePath);
        if (!fs_1.default.existsSync(absolutePath)) {
            missing.push(relativePath);
        }
    }
    const artifactPath = path_1.default.join(vistaDir, 'artifact-manifest.json');
    const artifactManifest = readJsonSafe(artifactPath);
    if (fs_1.default.existsSync(artifactPath) && (!artifactManifest || artifactManifest.schemaVersion !== 1)) {
        missing.push('artifact-manifest.json (invalid schemaVersion)');
    }
    const runtimeManifestPath = path_1.default.join(vistaDir, 'server', 'runtime-manifest.json');
    const runtimeManifest = readJsonSafe(runtimeManifestPath);
    if (mode === 'rsc' &&
        fs_1.default.existsSync(runtimeManifestPath) &&
        (!runtimeManifest || runtimeManifest.schemaVersion !== 1)) {
        missing.push('server/runtime-manifest.json (invalid schemaVersion)');
    }
    const fileTracePath = path_1.default.join(vistaDir, 'server', 'file-trace.json');
    const fileTrace = readJsonSafe(fileTracePath);
    if (mode === 'rsc' &&
        fs_1.default.existsSync(fileTracePath) &&
        (!fileTrace || fileTrace.schemaVersion !== 1 || !Array.isArray(fileTrace.copiedFiles))) {
        missing.push('server/file-trace.json (invalid schemaVersion)');
    }
    return missing;
}
function assertVistaArtifacts(cwd, mode) {
    const missing = validateVistaArtifacts(cwd, mode);
    if (missing.length === 0)
        return;
    const missingList = missing.map((entry) => `- ${entry}`).join('\n');
    throw new Error(`[vista:server] Missing or invalid ${constants_1.BUILD_DIR} artifacts for ${mode} mode.\n${missingList}\nRun "vista build${mode === 'rsc' ? ' --rsc' : ''}" first.`);
}
