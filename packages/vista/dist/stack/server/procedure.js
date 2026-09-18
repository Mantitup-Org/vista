"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProcedureBuilder = createProcedureBuilder;
exports.isOperation = isOperation;
function cloneState(state) {
    return {
        schema: state?.schema,
        outputSchema: state?.outputSchema,
        middlewares: [...(state?.middlewares ?? [])],
        outputFormat: state?.outputFormat ?? 'json',
    };
}
function createOperation(type, state, handler) {
    return {
        type,
        schema: state.schema,
        outputSchema: state.outputSchema,
        handler,
        middlewares: [...state.middlewares],
        outputFormat: state.outputFormat,
    };
}
function createProcedureBuilder(state) {
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
    };
}
function isOperation(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value;
    return ((candidate.type === 'get' || candidate.type === 'post') &&
        typeof candidate.handler === 'function' &&
        Array.isArray(candidate.middlewares));
}
