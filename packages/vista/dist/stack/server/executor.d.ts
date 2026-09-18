import type { MiddlewareFunction, OperationType, ProcedureRecord, StackExecutionContext, StackRequestLike, StackResponseToolkit, StackRouter, StackSerializationMode } from './types';
export declare class StackRouteNotFoundError extends Error {
    status: number;
    constructor(path: string);
}
export declare class StackMethodNotAllowedError extends Error {
    status: number;
    constructor(path: string, method: string);
}
export declare class StackValidationError extends Error {
    status: number;
    cause: unknown;
    constructor(message: string, cause?: unknown);
}
export declare class StackOutputValidationError extends StackValidationError {
    status: number;
    constructor(message: string, cause?: unknown);
}
export declare function createResponseToolkit(mode?: StackSerializationMode): StackResponseToolkit;
export declare function runMiddlewareChain<TCtx, TEnv>(middlewares: MiddlewareFunction<any, any, TEnv>[], context: TCtx, env: TEnv, req: StackRequestLike, c: StackResponseToolkit): Promise<TCtx>;
export interface ExecuteOperationOptions<TCtx, TEnv> extends StackExecutionContext<TCtx, TEnv> {
    middlewares?: MiddlewareFunction<any, any, TEnv>[];
    serialization?: StackSerializationMode;
}
export declare function executeOperation<TCtx, TInput, TOutput, TEnv>(operation: OperationType<TInput, TOutput, TCtx, TEnv>, options: ExecuteOperationOptions<TCtx, TEnv>): Promise<TOutput>;
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
export declare function executeRoute<TProcedures extends ProcedureRecord, TCtx, TEnv>(router: StackRouter<TProcedures, TCtx, TEnv>, options: ExecuteRouteOptions<TCtx, TEnv>): Promise<ExecuteRouteResult>;
