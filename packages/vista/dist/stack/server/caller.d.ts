import type { OperationType, ProcedureRecord, StackRequestLike, StackRouter, StackSerializationMode } from './types';
export interface CreateCallerOptions<TCtx, TEnv> {
    ctx: TCtx;
    env: TEnv;
    req?: StackRequestLike;
    serialization?: StackSerializationMode;
}
type CallerFn<TInput, TOutput> = [TInput] extends [void] ? () => Promise<TOutput> : (input: TInput) => Promise<TOutput>;
export type InferCaller<TNode> = TNode extends OperationType<infer TInput, infer TOutput, any, any> ? CallerFn<TInput, TOutput> : TNode extends ProcedureRecord ? {
    [TKey in keyof TNode]: InferCaller<TNode[TKey]>;
} : never;
export declare function createCaller<TProcedures extends ProcedureRecord, TCtx, TEnv>(router: StackRouter<TProcedures, TCtx, TEnv>, options: CreateCallerOptions<TCtx, TEnv>): InferCaller<TProcedures>;
export {};
