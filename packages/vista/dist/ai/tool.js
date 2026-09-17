"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tool = tool;
exports.formatToolForOpenAI = formatToolForOpenAI;
exports.formatToolForAnthropic = formatToolForAnthropic;
exports.formatToolForGemini = formatToolForGemini;
function tool(options) {
    if (!options.name || typeof options.name !== 'string') {
        throw new Error('Tool must have a valid string name');
    }
    if (!options.description || typeof options.description !== 'string') {
        throw new Error(`Tool "${options.name}" must have a description`);
    }
    if (typeof options.execute !== 'function') {
        throw new Error(`Tool "${options.name}" must have an execute function`);
    }
    return {
        name: options.name,
        description: options.description,
        parameters: options.parameters || { type: 'object', properties: {} },
        execute: options.execute,
    };
}
function formatToolForOpenAI(tool) {
    return {
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters || { type: 'object', properties: {} },
        },
    };
}
function formatToolForAnthropic(tool) {
    return {
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters || { type: 'object', properties: {} },
    };
}
function formatToolForGemini(tool) {
    return {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters || { type: 'object', properties: {} },
    };
}
