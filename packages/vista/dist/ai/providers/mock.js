"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMockModel = createMockModel;
function createMockModel(options = {}) {
    const modelName = options.modelName || 'mock-model';
    let responseIndex = 0;
    return {
        provider: 'mock',
        modelName,
        async generateText(genOptions) {
            // Check if last user message asks for a tool or if simulated tool calls provided
            const lastMsg = genOptions.messages[genOptions.messages.length - 1];
            const content = lastMsg ? lastMsg.content : '';
            // If simulated tool calls exist and haven't been provided in options yet
            if (options.toolCalls && options.toolCalls.length > 0 && !lastMsg?.toolCallId) {
                return {
                    text: '',
                    toolCalls: options.toolCalls,
                    usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
                    finishReason: 'tool-calls',
                };
            }
            // Check if user content triggers tool simulation for tests
            if (genOptions.tools && genOptions.tools.length > 0 && content.includes('CALL_TOOL:')) {
                const match = content.match(/CALL_TOOL:([a-zA-Z0-9_-]+)\((.*?)\)/);
                if (match) {
                    const toolName = match[1];
                    let args = {};
                    try {
                        args = JSON.parse(match[2] || '{}');
                    }
                    catch {
                        args = { query: match[2] };
                    }
                    return {
                        text: '',
                        toolCalls: [{ id: `call_${Date.now()}`, name: toolName, arguments: args }],
                        usage: { promptTokens: 15, completionTokens: 10, totalTokens: 25 },
                        finishReason: 'tool-calls',
                    };
                }
            }
            let text = options.defaultResponse || `Mock response for: "${content.slice(0, 30)}"`;
            if (options.cannedResponses && options.cannedResponses.length > 0) {
                text = options.cannedResponses[responseIndex % options.cannedResponses.length];
                responseIndex++;
            }
            return {
                text,
                usage: {
                    promptTokens: Math.max(1, content.length / 4),
                    completionTokens: Math.max(1, text.length / 4),
                    totalTokens: Math.max(2, (content.length + text.length) / 4),
                },
                finishReason: 'stop',
            };
        },
        async *streamText(genOptions) {
            const result = await this.generateText(genOptions);
            if (result.toolCalls && result.toolCalls.length > 0) {
                for (const call of result.toolCalls) {
                    yield { type: 'tool-call', toolCall: call };
                }
                return;
            }
            const words = result.text.split(' ');
            for (let i = 0; i < words.length; i++) {
                const chunk = (i === 0 ? '' : ' ') + words[i];
                yield { type: 'text-delta', textDelta: chunk };
            }
            yield {
                type: 'done',
                usage: result.usage,
            };
        },
    };
}
