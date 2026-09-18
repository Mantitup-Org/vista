import { mergeRouters as mergeStackRouters } from './server/merge-routers';
import { createCaller as createStackCaller, type CreateCallerOptions, type InferCaller } from './server/caller';
import { createProcedureBuilder, type ProcedureBuilder } from './server/procedure';
import { createRouter, type CreateRouterOptions } from './server/router';
import { createSerializer, type StackSerializer } from './server/serialization';
import type {
  MiddlewareFunction,
  ProcedureRecord,
  StackRouter,
  StackSerializationMode,
} from './server/types';

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
  middleware<TCurrentCtx extends TCtx, TOutput extends Record<string, unknown> = {}>(
    handler: MiddlewareFunction<TCurrentCtx, TOutput, TEnv>
  ): MiddlewareFunction<TCurrentCtx, TOutput, TEnv>;
  router<TProcedures extends ProcedureRecord>(
    procedures: TProcedures,
    options?: CreateRouterOptions<TEnv>
  ): StackRouter<TProcedures, TCtx, TEnv>;
  mergeRouters: typeof mergeStackRouters;
  createCaller<TProcedures extends ProcedureRecord>(
    router: StackRouter<TProcedures, TCtx, TEnv>,
    options: CreateCallerOptions<TCtx, TEnv>
  ): InferCaller<TProcedures>;
  serializer: StackSerializer;
  options: Required<VStackInitOptions>;
}

export function initStack<TCtx extends Record<string, unknown> = {}, TEnv = unknown>(
  options: VStackInitOptions = {}
): VStackInstance<TCtx, TEnv> {
  const normalizedOptions: Required<VStackInitOptions> = {
    serialization: options.serialization ?? 'json',
  };

  return {
    procedure: createProcedureBuilder<TCtx, TEnv>(),
    middleware(handler) {
      return handler;
    },
    router<TProcedures extends ProcedureRecord>(procedures: TProcedures, routerOptions) {
      return createRouter<TProcedures, TCtx, TEnv>(procedures, routerOptions);
    },
    mergeRouters(...routers) {
      return mergeStackRouters(...routers);
    },
    createCaller(router, callerOptions) {
      return createStackCaller(router, callerOptions);
    },
    serializer: createSerializer(normalizedOptions.serialization),
    options: normalizedOptions,
  };
}

export const vstack = {
  init: initStack,
};

/**
 * Re-export server stack primitives from `@vistagenic/vista/stack`.
 */
export type { CreateRouterOptions } from './server/router';
export * from './server';
