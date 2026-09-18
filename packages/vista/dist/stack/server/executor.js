"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StackValidationError = exports.StackMethodNotAllowedError = exports.StackRouteNotFoundError = void 0;
exports.createResponseToolkit = createResponseToolkit;
exports.runMiddlewareChain = runMiddlewareChain;
exports.executeOperation = executeOperation;
exports.executeRoute = executeRoute;
const serialization_1 = require("./serialization");
const router_1 = require("./router");
function isObjectRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function normalizeResponseInit(init) {
    if (typeof init === 'number') {
        return { status: init };
    }
    return init ?? {};
}
class StackRouteNotFoundError extends Error {
    status = 404;
    constructor(path) {
        super(`No typed API route found for "${path}"`);
        this.name = 'StackRouteNotFoundError';
    }
}
exports.StackRouteNotFoundError = StackRouteNotFoundError;
class StackMethodNotAllowedError extends Error {
    status = 405;
    constructor(path, method) {
        super(`Method "${method.toUpperCase()}" is not allowed for "${path}"`);
        this.name = 'StackMethodNotAllowedError';
    }
}
exports.StackMethodNotAllowedError = StackMethodNotAllowedError;
class StackValidationError extends Error {
    status = 400;
    cause;
    constructor(message, cause) {
        super(message);
        this.name = 'StackValidationError';
        this.cause = cause;
    }
}
exports.StackValidationError = StackValidationError;
function createResponseToolkit(mode = 'json') {
    return {
        json(data, init) {
            const payload = (0, serialization_1.serializeWithMode)(data, 'json');
            return Response.json(payload, normalizeResponseInit(init));
        },
        text(data, init) {
            return new Response(String(data), normalizeResponseInit(init));
        },
        superjson(data, init) {
            const payload = {
                mode: 'superjson',
                data: (0, serialization_1.serializeWithMode)(data, 'superjson'),
            };
            return Response.json(payload, normalizeResponseInit(init));
        },
    };
}
async function runMiddlewareChain(middlewares, context, env, req, c) {
    const executeAt = async (index, currentContext) => {
        if (index >= middlewares.length) {
            return currentContext;
        }
        const middleware = middlewares[index];
        let nextCalled = false;
        let nextContextPromise;
        const next = async (extension = {}) => {
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
            ctx: currentContext,
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
    return (await executeAt(0, context));
}
function resolveRawInput(operation, req) {
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
function resolveInput(operation, req, serialization) {
    const rawInput = resolveRawInput(operation, req);
    const input = (0, serialization_1.deserializeWithMode)(rawInput, serialization);
    if (!operation.schema) {
        return input;
    }
    try {
        return operation.schema.parse(input);
    }
    catch (error) {
        throw new StackValidationError('Invalid typed API input', error);
    }
}
async function executeOperation(operation, options) {
    const middlewareChain = [...(options.middlewares ?? []), ...operation.middlewares];
    const finalContext = await runMiddlewareChain(middlewareChain, options.ctx, options.env, options.req, options.c);
    const input = resolveInput(operation, options.req, options.serialization ?? 'json');
    return operation.handler({
        ctx: finalContext,
        input,
        env: options.env,
        req: options.req,
        c: options.c,
    });
}
function hasPath(routes, path) {
    return Object.prototype.hasOwnProperty.call(routes, path);
}
async function executeRoute(router, options) {
    const normalizedPath = (0, router_1.normalizeStackRoutePath)(options.path);
    const normalizedMethod = String(options.method).toLowerCase();
    const routes = router.routes;
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
    const payload = await executeOperation(candidateRoute, {
        ctx: options.ctx,
        env: options.env,
        req: options.req,
        c: responseToolkit,
        middlewares: router.metadata.globalMiddlewares,
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
    const serializedData = (0, serialization_1.serializeWithMode)(payload, serialization);
    return {
        path: normalizedPath,
        method: normalizedMethod,
        data: (0, serialization_1.deserializeWithMode)(payload, serialization),
        serializedData,
    };
}
