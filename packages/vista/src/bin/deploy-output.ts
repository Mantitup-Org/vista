import fs from 'fs';
import path from 'path';
import {
  loadConfig,
  resolveDeploymentConfig,
  type VistaConfig,
  type DeploymentTarget,
} from '../config';
import {
  detectDeploymentTarget,
  getDeploymentAdapter,
  type DeploymentContext,
  type DeploymentResult,
} from '../deployment';

export interface DeployOutputOptions {
  cwd: string;
  vistaDir: string;
  debug?: boolean;
  target?: string;
  config?: VistaConfig;
}

export function generateDeploymentOutputs(options: DeployOutputOptions): DeploymentResult | null {
  const { cwd, vistaDir, debug } = options;
  const config = options.config || loadConfig(cwd);
  const deploymentConfig = resolveDeploymentConfig(config.deployment);

  const target: DeploymentTarget = detectDeploymentTarget(cwd, deploymentConfig, options.target);
  const adapter = getDeploymentAdapter(target);

  if (!adapter) {
    if (debug) {
      console.log(`[vista:deploy] No deployment adapter found for target: "${target}". Skipping.`);
    }
    return null;
  }

  const context: DeploymentContext = {
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
        console.log(`  - ${path.relative(cwd, file) || file}`);
      }
    }
  }

  return result;
}
