"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDeploymentOutputs = generateDeploymentOutputs;
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
const deployment_1 = require("../deployment");
function generateDeploymentOutputs(options) {
    const { cwd, vistaDir, debug } = options;
    const config = options.config || (0, config_1.loadConfig)(cwd);
    const deploymentConfig = (0, config_1.resolveDeploymentConfig)(config.deployment);
    const target = (0, deployment_1.detectDeploymentTarget)(cwd, deploymentConfig, options.target);
    const adapter = (0, deployment_1.getDeploymentAdapter)(target);
    if (!adapter) {
        if (debug) {
            console.log(`[vista:deploy] No deployment adapter found for target: "${target}". Skipping.`);
        }
        return null;
    }
    const context = {
        cwd,
        vistaDir,
        config,
        deploymentConfig,
        target,
        debug,
    };
    const result = adapter.generate(context);
    if (debug || process.env.VISTA_DEBUG) {
        console.log(`[vista:deploy] Applied deployment adapter "${adapter.name}" (target: ${target})`);
        if (result.generatedFiles.length > 0) {
            console.log(`[vista:deploy] Generated files:`);
            for (const file of result.generatedFiles) {
                console.log(`  - ${path_1.default.relative(cwd, file) || file}`);
            }
        }
    }
    return result;
}
