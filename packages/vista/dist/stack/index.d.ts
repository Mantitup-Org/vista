import { mergeRouters as mergeStackRouters } from './server/merge-routers';
import { type CreateCallerOptions, type InferCaller } from './server/caller';
import { type ProcedureBuilder } from './server/procedure';
import { type CreateRouterOptions } from './server/router';
import { type StackSerializer } from './server/serialization';
import type { MiddlewareFunction, ProcedureRecord, StackRouter, StackSerializationMode } from './server/types';
/**
 * Package entry for `@vistagenic/vista/stack`.
 *
 * Example:
 *   import { vstack } from '@vistagenic/vista/stack'
 *   const v = vstack.init()
 */
export interface VStackInitOptions {
    serialization?: StackSerializationMode;
}
export interface VStackInstance<TCtx, TEnv> {
    procedure: ProcedureBuilder<TCtx, TEnv>;
    middleware<TCurrentCtx extends TCtx, TOutput extends Record<string, unknown> = {}>(handler: MiddlewareFunction<TCurrentCtx, TOutput, TEnv>): MiddlewareFunction<TCurrentCtx, TOutput, TEnv>;
    router<TProcedures extends ProcedureRecord>(procedures: TProcedures, options?: CreateRouterOptions<TEnv>): StackRouter<TProcedures, TCtx, TEnv>;
    mergeRouters: typeof mergeStackRouters;
    createCaller<TProcedures extends ProcedureRecord>(router: StackRouter<TProcedures, TCtx, TEnv>, options: CreateCallerOptions<TCtx, TEnv>): InferCaller<TProcedures>;
    serializer: StackSerializer;
    options: Required<VStackInitOptions>;
}
export declare function initStack<TCtx extends Record<string, unknown> = {}, TEnv = unknown>(options?: VStackInitOptions): VStackInstance<TCtx, TEnv>;
export declare const vstack: {
    init: typeof initStack;
};
/**
 * Re-export server stack primitives from `@vistagenic/vista/stack`.
 */
export type { CreateRouterOptions } from './server/router';
export * from './server';
