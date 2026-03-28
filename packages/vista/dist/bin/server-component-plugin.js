"use strict";
/**
 * Vista Server Component Webpack Plugin
 *
 * Checks for server/client boundary violations and invalid route segment
 * config on every webpack compilation.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VistaServerComponentPlugin = void 0;
const path = __importStar(require("path"));
const module_boundary_validator_1 = require("../server/module-boundary-validator");
class VistaServerComponentPlugin {
    appDir;
    componentsDir;
    cacheComponentsEnabled;
    constructor(options) {
        this.appDir = options.appDir;
        this.componentsDir = options.componentsDir;
        this.cacheComponentsEnabled = Boolean(options.cacheComponentsEnabled);
    }
    apply(compiler) {
        // Use afterCompile hook so we can add errors to compilation
        compiler.hooks.afterCompile.tap('VistaServerComponentPlugin', (compilation) => {
            const errors = (0, module_boundary_validator_1.validateModuleBoundaries)({
                appDir: this.appDir,
                extraRoots: this.componentsDir ? [this.componentsDir] : [],
                cacheComponentsEnabled: this.cacheComponentsEnabled,
            }).issues;
            if (errors.length > 0) {
                console.log('');
                console.log('\x1b[41m\x1b[37m ERROR \x1b[0m \x1b[31mServer/Segment Validation Error\x1b[0m');
                console.log('');
                for (const error of errors) {
                    const relativeFile = path.relative(this.appDir, error.filePath);
                    console.log(`\x1b[31m✗\x1b[0m ${relativeFile}`);
                    console.log(`  ${error.message}`);
                    console.log('');
                    if (error.fix) {
                        console.log(`  \x1b[36mTo fix:\x1b[0m ${error.fix}`);
                        console.log('');
                    }
                    // Add webpack error so it shows in overlay
                    const WebpackError = require('webpack').WebpackError;
                    const err = new WebpackError(`${error.message}\n${error.fix ? `Fix: ${error.fix}` : ''}`.trim());
                    err.file = relativeFile;
                    compilation.errors.push(err);
                }
            }
        });
    }
}
exports.VistaServerComponentPlugin = VistaServerComponentPlugin;
exports.default = VistaServerComponentPlugin;
