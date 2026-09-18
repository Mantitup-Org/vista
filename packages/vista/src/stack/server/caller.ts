import { isOperation } from './procedure';
import { createResponseToolkit, executeOperation } from './executor';
import type {
  OperationType,
  ProcedureNode,
  ProcedureRecord,
  StackRequestLike,
  StackRouter,
  StackSerializationMode,
} from './types';

export interface CreateCallerOptions<TCtx, TEnv> {
  ctx: TCtx;
  env: TEnv;
  req?: StackRequestLike;
  serialization?: StackSerializationMode;
}

type CallerFn<TInput, TOutput> = [TInput] extends [void]
  ? () => Promise<TOutput>
  : (input: TInput) => Promise<TOutput>;

export type InferCaller<TNode> = TNode extends OperationType<infer TInput, infer TOutput, any, any>
  ? CallerFn<TInput, TOutput>
  : TNode extends ProcedureRecord
    ? { [TKey in keyof TNode]: InferCaller<TNode[TKey]> }
    : never;

function buildRequest(operation: OperationType, input: unknown, base?: StackRequestLike): StackRequestLike {
  if (operation.type === 'get') {
    return {
      ...base,
      method: 'GET',
      query: (input as Record<string, unknown> | undefined) ?? base?.query ?? {},
    };
  }

  return {
    ...base,
    method: 'POST',
    body: input ?? base?.body,
  };
}

function createNodeCaller<TCtx, TEnv>(
  node: ProcedureNode,
  router: StackRouter<any, TCtx, TEnv>,
  options: CreateCallerOptions<TCtx, TEnv>
): unknown {
  if (isOperation(node)) {
    return async (input?: unknown) => {
      const toolkit = createResponseToolkit(options.serialization ?? 'json');
      return executeOperation(node, {
        ctx: options.ctx,
        env: options.env,
        req: buildRequest(node, input, options.req),
        c: toolkit,
        middlewares: router.metadata.globalMiddlewares as never,
        serialization: options.serialization,
      });
    };
  }

  const nested: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(node)) {
    nested[key] = createNodeCaller(child, router, options);
  }
  return nested;
}

export function createCaller<TProcedures extends ProcedureRecord, TCtx, TEnv>(
  router: StackRouter<TProcedures, TCtx, TEnv>,
  options: CreateCallerOptions<TCtx, TEnv>
): InferCaller<TProcedures> {
  return createNodeCaller(router.procedures, router, options) as InferCaller<TProcedures>;
}
