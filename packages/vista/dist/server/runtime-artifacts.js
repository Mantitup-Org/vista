"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveRuntimeProjectRoot = resolveRuntimeProjectRoot;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("../constants");
function readRuntimeArtifactsManifest(projectRoot) {
    const manifestPath = path_1.default.join(projectRoot, constants_1.BUILD_DIR, 'server', 'runtime-manifest.json');
    if (!fs_1.default.existsSync(manifestPath)) {
        return null;
    }
    try {
        return JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf-8'));
    }
    catch {
        return null;
    }
}
function resolveRuntimeProjectRoot(projectRoot, explicitRuntimeRoot) {
    if (explicitRuntimeRoot && explicitRuntimeRoot.trim().length > 0) {
        return path_1.default.resolve(explicitRuntimeRoot);
    }
    const envRuntimeRoot = process.env.VISTA_RUNTIME_ROOT;
    if (envRuntimeRoot && envRuntimeRoot.trim().length > 0) {
        return path_1.default.resolve(envRuntimeRoot);
    }
    const manifest = readRuntimeArtifactsManifest(projectRoot);
    if (manifest?.runtimeRootRelative) {
        return path_1.default.resolve(projectRoot, manifest.runtimeRootRelative);
    }
    return projectRoot;
}
