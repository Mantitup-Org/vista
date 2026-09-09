"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agent = agent;
const providers_1 = require("./providers");
/**
 * Creates an AI agent configured with a specific model and tools.
 */
function agent(options) {
    // If memory is enabled, we keep an internal array of messages.
    const internalMemory = [];
    return async function run(runOptions) {
        const promptString = typeof runOptions === 'string' ? runOptions : runOptions.prompt;
        const history = typeof runOptions === 'string' ? undefined : runOptions.history;
        const shouldStream = typeof runOptions === 'string' ? false : runOptions.stream;
        const languageModel = await (0, providers_1.resolveProvider)(options.model);
        // Dynamically import ai to avoid CommonJS/ESM sync require issues
        const { generateText, streamText } = await import('ai');
        // Build the messages array
        const messages = [];
        if (options.system) {
            messages.push({ role: 'system', content: options.system });
        }
        if (history) {
            messages.push(...history);
        }
        else if (options.memory) {
            messages.push(...internalMemory);
        }
        messages.push({ role: 'user', content: promptString });
        if (shouldStream) {
            const result = await streamText({
                model: languageModel,
                messages,
                tools: options.tools,
                onFinish: ({ responseMessages }) => {
                    if (options.memory) {
                        internalMemory.push({ role: 'user', content: promptString });
                        internalMemory.push(...responseMessages);
                    }
                }
            });
            return result;
        }
        else {
            const result = await generateText({
                model: languageModel,
                messages,
                tools: options.tools,
            });
            if (options.memory) {
                internalMemory.push({ role: 'user', content: promptString });
                internalMemory.push(...result.responseMessages);
            }
            return result;
        }
    };
}
