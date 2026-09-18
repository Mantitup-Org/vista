import type {
  GetOperation,
  InferMiddlewareOutput,
  InferSchemaInput,
  MiddlewareFunction,
  PostOperation,
  Prettify,
  ProcedureHandler,
  SchemaLike,
} from './types';

type ProcedureOutputFormat = 'json';

interface ProcedureBuilderState<TEnv> {
  schema?: SchemaLike<any>;
  outputSchema?: SchemaLike<any>;
  middlewares: MiddlewareFunction<any, any, TEnv>[];
  outputFormat: ProcedureOutputFormat;
}

export interface ProcedureBuilder<TCtx, TEnv, TInput = void> {
  use<TMiddleware extends MiddlewareFunction<TCtx, any, TEnv>>(
    middleware: TMiddleware
  ): ProcedureBuilder<Prettify<TCtx & InferMiddlewareOutput<TMiddleware>>, TEnv, TInput>;
  input<TSchema extends SchemaLike<any>>(
    schema: TSchema
  ): ProcedureBuilder<TCtx, TEnv, InferSchemaInput<TSchema>>;
  output<TSchema extends SchemaLike<any>>(
    schema: TSchema
  ): ProcedureBuilder<TCtx, TEnv, TInput>;
  query<TOutput>(
    handler: ProcedureHandler<TCtx, TInput, TEnv, TOutput>
  ): GetOperation<TInput, TOutput, TCtx, TEnv>;
  mutation<TOutput>(
    handler: ProcedureHandler<TCtx, TInput, TEnv, TOutput>
  ): PostOperation<TInput, TOutput, TCtx, TEnv>;
  get<TOutput>(
    handler: ProcedureHandler<TCtx, TInput, TEnv, TOutput>
  ): GetOperation<TInput, TOutput, TCtx, TEnv>;
  post<TOutput>(
    handler: ProcedureHandler<TCtx, TInput, TEnv, TOutput>
  ): PostOperation<TInput, TOutput, TCtx, TEnv>;
}

function cloneState<TEnv>(state?: Partial<ProcedureBuilderState<TEnv>>): ProcedureBuilderState<TEnv> {
  return {
    schema: state?.schema,
    outputSchema: state?.outputSchema,
    middlewares: [...(state?.middlewares ?? [])],
    outputFormat: state?.outputFormat ?? 'json',
  };
}

function createOperation<TType extends 'get' | 'post', TCtx, TInput, TOutput, TEnv>(
  type: TType,
  state: ProcedureBuilderState<TEnv>,
  handler: ProcedureHandler<TCtx, TInput, TEnv, TOutput>
): TType extends 'get'
  ? GetOperation<TInput, TOutput, TCtx, TEnv>
  : PostOperation<TInput, TOutput, TCtx, TEnv> {
  return {
    type,
    schema: state.schema,
    outputSchema: state.outputSchema,
    handler,
    middlewares: [...state.middlewares],
    outputFormat: state.outputFormat,
  } as never;
}

export function createProcedureBuilder<TCtx = {}, TEnv = unknown, TInput = void>(
  state?: Partial<ProcedureBuilderState<TEnv>>
): ProcedureBuilder<TCtx, TEnv, TInput> {
  const currentState = cloneState(state);

  return {
    use(middleware) {
      return createProcedureBuilder({
        ...currentState,
        middlewares: [...currentState.middlewares, middleware],
      });
    },

    input(schema) {
      return createProcedureBuilder({
        ...currentState,
        schema,
      });
    },

    output(schema) {
      return createProcedureBuilder({
        ...currentState,
        outputSchema: schema,
      });
    },

    query(handler) {
      return createOperation('get', currentState, handler);
    },

    mutation(handler) {
      return createOperation('post', currentState, handler);
    },

    get(handler) {
      return createOperation('get', currentState, handler);
    },

    post(handler) {
      return createOperation('post', currentState, handler);
    },
  } satisfies ProcedureBuilder<TCtx, TEnv, TInput>;
}

export function isOperation(value: unknown): value is GetOperation | PostOperation {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<GetOperation | PostOperation>;
  return (
    (candidate.type === 'get' || candidate.type === 'post') &&
    typeof candidate.handler === 'function' &&
    Array.isArray(candidate.middlewares)
  );
}
