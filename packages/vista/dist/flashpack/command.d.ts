type FlashpackCommandPhase = 'dev' | 'build' | 'start';
interface RunFlashpackCommandOptions {
    cwd?: string;
    port?: string | number;
    strict?: boolean;
    action?: 'prepare' | 'run';
}
export declare function runFlashpackEngineCommand(phase: FlashpackCommandPhase, options?: RunFlashpackCommandOptions): Promise<void>;
export default runFlashpackEngineCommand;
