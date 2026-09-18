export type MaybePromise<T> = T | Promise<T>;

export type StackSerializationMode = 'json' | 'superjson';

export interface SchemaLike<T = unknown> {
  parse(value: unknown): T;
}

export type InferSchemaInput<TSchema> = TSchema extends SchemaLike<infer T> ? T : void;

export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type UnionToIntersection<TUnion> = (
  TUnion extends unknown ? (value: TUnion) => void : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never;

type JoinPath<TLeft extends string, TRight extends string> = TLeft extends ''
  ? TRight
  : `${TLeft}/${TRight}`;

export interface StackCookieStore {
  get(name: string): { name: string; value: string } | undefined;
  getAll(): Array<{ name: string; value: string }>;
  has(name: string): boolean;
}

export interface StackRequestLike {
  method?: string;
  path?: string;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  cookies?: StackCookieStore;
  [key: string]: unknown;
}

export interface StackResponseToolkit {
  json<T>(data: T, init?: number | ResponseInit): Response;
  text(data: string, init?: number | ResponseInit): Response;
  superjson<T>(data: T, init?: number | ResponseInit): Response;
}

export interface ProcedureHandlerParams<TCtx, TInput, TEnv> {
  ctx: TCtx;
  input: TInput;
  env: TEnv;
  req: StackRequestLike;
  c: StackResponseToolkit;
}

export type ProcedureHandler<TCtx, TInput, TEnv, TOutput> = (
  params: ProcedureHandlerParams<TCtx, TInput, TEnv>
) => MaybePromise<TOutput>;

export interface MiddlewareParams<TCtx, TEnv> {
  ctx: TCtx;
  env: TEnv;
  req: StackRequestLike;
  c: StackResponseToolkit;
  next<TAdded extends Record<string, unknown> = {}>(
    extension?: TAdded
  ): Promise<TCtx & TAdded>;
}

export type MiddlewareFunction<TCtx = {}, TReturn = void, TEnv = unknown> = (
  params: MiddlewareParams<TCtx, TEnv>
) => MaybePromise<TReturn | void>;

export type NormalizeMiddlewareResult<TValue> = TValue extends void | undefined
  ? {}
  : TValue extends Record<string, unknown>
    ? TValue
    : {};

export interface OperationBase<TInput, TOutput, TCtx, TEnv> {
  schema?: SchemaLike<TInput>;
  outputSchema?: SchemaLike<TOutput>;
  handler: ProcedureHandler<TCtx, TInput, TEnv, TOutput>;
  middlewares: MiddlewareFunction<any, any, TEnv>[];
  outputFormat: 'json';
}

export interface GetOperation<TInput = void, TOutput = unknown, TCtx = {}, TEnv = unknown>
  extends OperationBase<TInput, TOutput, TCtx, TEnv> {
  type: 'get';
}

export interface PostOperation<TInput = void, TOutput = unknown, TCtx = {}, TEnv = unknown>
  extends OperationBase<TInput, TOutput, TCtx, TEnv> {
  type: 'post';
}

export type OperationType<TInput = unknown, TOutput = unknown, TCtx = {}, TEnv = unknown> =
  | GetOperation<TInput, TOutput, TCtx, TEnv>
  | PostOperation<TInput, TOutput, TCtx, TEnv>;

export interface ProcedureRecord {
  [key: string]: ProcedureNode;
}

export type ProcedureNode = OperationType<any, any, any, any> | ProcedureRecord;

type FlatRouteMapUnion<TRecord extends Record<string, any>, TPrefix extends string> = {
  [TKey in Extract<keyof TRecord, string>]: TRecord[TKey] extends OperationType<any, any, any, any>
    ? { [TPath in JoinPath<TPrefix, TKey>]: TRecord[TKey] }
    : TRecord[TKey] extends Record<string, any>
      ? FlatRouteMapUnion<TRecord[TKey], JoinPath<TPrefix, TKey>>
      : never;
}[Extract<keyof TRecord, string>];

type FlatRouteMapInternal<TRecord extends Record<string, any>> =
  [FlatRouteMapUnion<TRecord, ''>] extends [never]
    ? {}
    : UnionToIntersection<FlatRouteMapUnion<TRecord, ''>>;

export type FlatRouteMap<TRecord extends Record<string, any>> = Prettify<FlatRouteMapInternal<TRecord>>;

export type InferMiddlewareOutput<TMiddleware> = TMiddleware extends MiddlewareFunction<
  any,
  infer TOutput,
  any
>
  ? NormalizeMiddlewareResult<TOutput>
  : {};

export interface StackErrorWithStatus {
  status?: number;
  message?: string;
}

export type StackErrorHandler = (error: unknown, req?: StackRequestLike) => Response;

export interface ResolvedRoute<TEnv = unknown> {
  path: string;
  operation: OperationType<any, any, any, TEnv>;
}

export interface RouterMetadata {
  basePath: string;
  globalMiddlewares: unknown[];
  procedures: Record<string, { type: 'get' | 'post' }>;
  registeredPaths: string[];
  errorHandler?: StackErrorHandler;
  config?: Record<string, unknown>;
}

export interface StackRouter<TProcedures extends ProcedureRecord, TCtx = {}, TEnv = unknown> {
  procedures: TProcedures;
  routes: FlatRouteMap<TProcedures>;
  metadata: RouterMetadata;
  resolve(path: string, method: string): ResolvedRoute<TEnv> | null;
}

export interface StackExecutionContext<TCtx, TEnv> {
  ctx: TCtx;
  env: TEnv;
  req: StackRequestLike;
  c: StackResponseToolkit;
}
