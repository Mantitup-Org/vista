import type { Express } from 'express';
import { type RSCEngineOptions } from './rsc-engine';
export declare function createRSCApp(options?: RSCEngineOptions): Express;
export declare function startFlashpackRSCServer(options?: RSCEngineOptions): Express;
export declare const startRSCServer: typeof startFlashpackRSCServer;
export { startFlashpackRSCServer as default };
