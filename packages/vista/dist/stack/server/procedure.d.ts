import type { GetOperation, InferMiddlewareOutput, InferSchemaInput, MiddlewareFunction, PostOperation, Prettify, ProcedureHandler, SchemaLike } from './types';
type ProcedureOutputFormat = 'json';
interface ProcedureBuilderState<TEnv> {
    schema?: SchemaLike<any>;
    outputSchema?: SchemaLike<any>;
    middlewares: MiddlewareFunction<any, any, TEnv>[];
    outputFormat: ProcedureOutputFormat;
}
export interface ProcedureBuilder<TCtx, TEnv, TInput = void> {
    use<TMiddleware extends MiddlewareFunction<TCtx, any, TEnv>>(middleware: TMiddleware): ProcedureBuilder<Prettify<TCtx & InferMiddlewareOutput<TMiddleware>>, TEnv, TInput>;
    input<TSchema extends SchemaLike<any>>(schema: TSchema): ProcedureBuilder<TCtx, TEnv, InferSchemaInput<TSchema>>;
    output<TSchema extends SchemaLike<any>>(schema: TSchema): ProcedureBuilder<TCtx, TEnv, TInput>;
    query<TOutput>(handler: ProcedureHandler<TCtx, TInput, TEnv, TOutput>): GetOperation<TInput, TOutput, TCtx, TEnv>;
    mutation<TOutput>(handler: ProcedureHandler<TCtx, TInput, TEnv, TOutput>): PostOperation<TInput, TOutput, TCtx, TEnv>;
    get<TOutput>(handler: ProcedureHandler<TCtx, TInput, TEnv, TOutput>): GetOperation<TInput, TOutput, TCtx, TEnv>;
    post<TOutput>(handler: ProcedureHandler<TCtx, TInput, TEnv, TOutput>): PostOperation<TInput, TOutput, TCtx, TEnv>;
}
export declare function createProcedureBuilder<TCtx = {}, TEnv = unknown, TInput = void>(state?: Partial<ProcedureBuilderState<TEnv>>): ProcedureBuilder<TCtx, TEnv, TInput>;
export declare function isOperation(value: unknown): value is GetOperation | PostOperation;
export {};
