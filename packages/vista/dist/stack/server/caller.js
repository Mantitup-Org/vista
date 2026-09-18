"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCaller = createCaller;
const procedure_1 = require("./procedure");
const executor_1 = require("./executor");
function buildRequest(operation, input, base) {
    if (operation.type === 'get') {
        return {
            ...base,
            method: 'GET',
            query: input ?? base?.query ?? {},
        };
    }
    return {
        ...base,
        method: 'POST',
        body: input ?? base?.body,
    };
}
function createNodeCaller(node, router, options) {
    if ((0, procedure_1.isOperation)(node)) {
        return async (input) => {
            const toolkit = (0, executor_1.createResponseToolkit)(options.serialization ?? 'json');
            return (0, executor_1.executeOperation)(node, {
                ctx: options.ctx,
                env: options.env,
                req: buildRequest(node, input, options.req),
                c: toolkit,
                middlewares: router.metadata.globalMiddlewares,
                serialization: options.serialization,
            });
        };
    }
    const nested = {};
    for (const [key, child] of Object.entries(node)) {
        nested[key] = createNodeCaller(child, router, options);
    }
    return nested;
}
function createCaller(router, options) {
    return createNodeCaller(router.procedures, router, options);
}
