"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tool = tool;
function tool(definition) {
    if (!definition?.name) {
        throw new Error('vista/ai tool() requires a name.');
    }
    if (typeof definition.execute !== 'function') {
        throw new Error(`vista/ai tool "${definition.name}" requires an execute() function.`);
    }
    return definition;
}
