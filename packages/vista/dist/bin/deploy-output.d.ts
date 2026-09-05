import { type VistaConfig } from '../config';
import { type DeploymentResult } from '../deployment';
export interface DeployOutputOptions {
    cwd: string;
    vistaDir: string;
    debug?: boolean;
    target?: string;
    config?: VistaConfig;
}
export declare function generateDeploymentOutputs(options: DeployOutputOptions): DeploymentResult | null;
