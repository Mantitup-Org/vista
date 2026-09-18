import { deserializeWithMode, serializeWithMode } from './serialization';
import { normalizeStackRoutePath } from './router';
import type {
  MiddlewareFunction,
  OperationType,
  ProcedureRecord,
  StackExecutionContext,
  StackRequestLike,
  StackResponseToolkit,
  StackRouter,
  StackSerializationMode,
} from './types';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeResponseInit(init?: number | ResponseInit): ResponseInit {
  if (typeof init === 'number') {
    return { status: init };
  }
  return init ?? {};
}

export class StackRouteNotFoundError extends Error {
  status = 404;

  constructor(path: string) {
    super(`No typed API route found for "${path}"`);
    this.name = 'StackRouteNotFoundError';
  }
}

export class StackMethodNotAllowedError extends Error {
  status = 405;

  constructor(path: string, method: string) {
    super(`Method "${method.toUpperCase()}" is not allowed for "${path}"`);
    this.name = 'StackMethodNotAllowedError';
  }
}

export class StackValidationError extends Error {
  status = 400;
  cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StackValidationError';
    this.cause = cause;
  }
}

export function createResponseToolkit(mode: StackSerializationMode = 'json'): StackResponseToolkit {
  return {
    json<T>(data: T, init?: number | ResponseInit) {
      const payload = serializeWithMode(data, 'json');
      return Response.json(payload, normalizeResponseInit(init));
    },
    text(data: string, init?: number | ResponseInit) {
      return new Response(String(data), normalizeResponseInit(init));
    },
    superjson<T>(data: T, init?: number | ResponseInit) {
      const payload = {
        mode: 'superjson' as const,
        data: serializeWithMode(data, 'superjson'),
      };
      return Response.json(payload, normalizeResponseInit(init));
    },
  };
}

export async function runMiddlewareChain<TCtx, TEnv>(
  middlewares: MiddlewareFunction<any, any, TEnv>[],
  context: TCtx,
  env: TEnv,
  req: StackRequestLike,
  c: StackResponseToolkit
): Promise<TCtx> {
  const executeAt = async (index: number, currentContext: unknown): Promise<unknown> => {
    if (index >= middlewares.length) {
      return currentContext;
    }

    const middleware = middlewares[index];
    let nextCalled = false;
    let nextContextPromise: Promise<unknown> | undefined;

    const next = async (extension: Record<string, unknown> = {}) => {
      if (nextCalled) {
        throw new Error('next() can only be called once per middleware');
      }

      nextCalled = true;
      const mergedContext = isObjectRecord(extension) && isObjectRecord(currentContext)
        ? { ...currentContext, ...extension }
        : currentContext;

      nextContextPromise = executeAt(index + 1, mergedContext);
      return nextContextPromise;
    };

    const result = await middleware({
      ctx: currentContext as never,
      env,
      req,
      c,
      next,
    });

    if (nextCalled) {
      const downstreamContext = await nextContextPromise;
      if (isObjectRecord(result) && isObjectRecord(downstreamContext)) {
        return { ...downstreamContext, ...result };
      }
      return downstreamContext;
    }

    if (isObjectRecord(result) && isObjectRecord(currentContext)) {
      return executeAt(index + 1, { ...currentContext, ...result });
    }

    return executeAt(index + 1, currentContext);
  };

  return (await executeAt(0, context)) as TCtx;
}

function resolveRawInput(operation: OperationType, req: StackRequestLike): unknown {
  if (operation.type === 'get') {
    if (req.query !== undefined) {
      return req.query;
    }
    return req.body;
  }

  if (req.body !== undefined) {
    return req.body;
  }

  return req.query;
}

function resolveInput(
  operation: OperationType,
  req: StackRequestLike,
  serialization: StackSerializationMode
): unknown {
  const rawInput = resolveRawInput(operation, req);
  const input = deserializeWithMode(rawInput, serialization);

  if (!operation.schema) {
    return input;
  }

  try {
    return operation.schema.parse(input);
  } catch (error) {
    throw new StackValidationError('Invalid typed API input', error);
  }
}

export interface ExecuteOperationOptions<TCtx, TEnv> extends StackExecutionContext<TCtx, TEnv> {
  middlewares?: MiddlewareFunction<any, any, TEnv>[];
  serialization?: StackSerializationMode;
}

export async function executeOperation<TCtx, TInput, TOutput, TEnv>(
  operation: OperationType<TInput, TOutput, TCtx, TEnv>,
  options: ExecuteOperationOptions<TCtx, TEnv>
): Promise<TOutput> {
  const middlewareChain = [...(options.middlewares ?? []), ...operation.middlewares];
  const finalContext = await runMiddlewareChain(
    middlewareChain,
    options.ctx,
    options.env,
    options.req,
    options.c
  );
  const input = resolveInput(operation, options.req, options.serialization ?? 'json') as TInput;

  return operation.handler({
    ctx: finalContext,
    input,
    env: options.env,
    req: options.req,
    c: options.c,
  });
}

export interface ExecuteRouteOptions<TCtx, TEnv> {
  path: string;
  method: string;
  req: StackRequestLike;
  ctx: TCtx;
  env: TEnv;
  serialization?: StackSerializationMode;
}

export interface ExecuteRouteResult<TData = unknown> {
  path: string;
  method: string;
  data: TData;
  serializedData: unknown;
}

function hasPath(routes: Record<string, OperationType<any, any, any, any>>, path: string): boolean {
  return Object.prototype.hasOwnProperty.call(routes, path);
}

export async function executeRoute<TProcedures extends ProcedureRecord, TCtx, TEnv>(
  router: StackRouter<TProcedures, TCtx, TEnv>,
  options: ExecuteRouteOptions<TCtx, TEnv>
): Promise<ExecuteRouteResult> {
  const normalizedPath = normalizeStackRoutePath(options.path);
  const normalizedMethod = String(options.method).toLowerCase();
  const routes = router.routes as Record<string, OperationType<any, any, any, TEnv>>;

  const candidateRoute = routes[normalizedPath];
  if (!candidateRoute) {
    throw new StackRouteNotFoundError(normalizedPath);
  }

  if (candidateRoute.type !== normalizedMethod) {
    if (hasPath(routes, normalizedPath)) {
      throw new StackMethodNotAllowedError(normalizedPath, normalizedMethod);
    }
    throw new StackRouteNotFoundError(normalizedPath);
  }

  const serialization = options.serialization ?? 'json';
  const responseToolkit = createResponseToolkit(serialization);
  const payload = await executeOperation(candidateRoute as never, {
    ctx: options.ctx,
    env: options.env,
    req: options.req,
    c: responseToolkit,
    middlewares: router.metadata.globalMiddlewares as MiddlewareFunction<any, any, TEnv>[],
    serialization,
  });

  if (typeof Response !== 'undefined' && payload instanceof Response) {
    return {
      path: normalizedPath,
      method: normalizedMethod,
      data: payload,
      serializedData: payload,
    };
  }

  const serializedData = serializeWithMode(payload, serialization);

  return {
    path: normalizedPath,
    method: normalizedMethod,
    data: deserializeWithMode(payload, serialization),
    serializedData,
  };
}
