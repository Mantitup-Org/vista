"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProvider = resolveProvider;
exports.createOpenAIProvider = createOpenAIProvider;
exports.createAnthropicProvider = createAnthropicProvider;
exports.createGeminiProvider = createGeminiProvider;
exports.createOllamaProvider = createOllamaProvider;
exports.createMockProvider = createMockProvider;
const stream_1 = require("./stream");
function resolveProvider(modelSpec) {
    if (typeof modelSpec !== 'string') {
        return modelSpec;
    }
    const colonIdx = modelSpec.indexOf(':');
    const providerName = colonIdx !== -1 ? modelSpec.slice(0, colonIdx).toLowerCase() : 'mock';
    const modelName = colonIdx !== -1 ? modelSpec.slice(colonIdx + 1) : modelSpec;
    switch (providerName) {
        case 'openai':
            return createOpenAIProvider(modelName);
        case 'anthropic':
            return createAnthropicProvider(modelName);
        case 'gemini':
            return createGeminiProvider(modelName);
        case 'ollama':
        case 'local':
            return createOllamaProvider(modelName);
        default:
            return createMockProvider(modelName);
    }
}
function createOpenAIProvider(defaultModel = 'gpt-4o') {
    return {
        name: 'openai',
        async generate(options) {
            const apiKey = process.env.OPENAI_API_KEY;
            const model = options.model || defaultModel;
            if (!apiKey) {
                return createMockProvider(model).generate(options);
            }
            const body = {
                model,
                messages: options.messages.map((m) => ({
                    role: m.role === 'tool' ? 'function' : m.role,
                    content: m.content,
                })),
                temperature: options.temperature ?? 0.7,
            };
            if (options.tools && options.tools.length > 0) {
                body.tools = options.tools.map((t) => ({
                    type: 'function',
                    function: {
                        name: t.name,
                        description: t.description,
                        parameters: t.parameters,
                    },
                }));
            }
            const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });
            if (!resp.ok) {
                throw new Error(`OpenAI API error (${resp.status}): ${await resp.text()}`);
            }
            const data = (await resp.json());
            const choice = data.choices?.[0];
            const message = choice?.message;
            return {
                text: message?.content || '',
                toolCalls: message?.tool_calls,
                finishReason: choice?.finish_reason || 'stop',
                usage: {
                    promptTokens: data.usage?.prompt_tokens || 0,
                    completionTokens: data.usage?.completion_tokens || 0,
                    totalTokens: data.usage?.total_tokens || 0,
                },
            };
        },
        async stream(options) {
            const result = await this.generate(options);
            const text = result.text;
            const chunks = text.match(/.{1,16}/g) || [text];
            return (0, stream_1.createReadableTextStream)(chunks);
        },
    };
}
function createAnthropicProvider(defaultModel = 'claude-3-5-sonnet-20241022') {
    return {
        name: 'anthropic',
        async generate(options) {
            const apiKey = process.env.ANTHROPIC_API_KEY;
            const model = options.model || defaultModel;
            if (!apiKey) {
                return createMockProvider(model).generate(options);
            }
            const systemMsg = options.messages.find((m) => m.role === 'system');
            const nonSystemMsgs = options.messages.filter((m) => m.role !== 'system');
            const body = {
                model,
                messages: nonSystemMsgs.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
                max_tokens: options.maxTokens ?? 1024,
            };
            if (systemMsg) {
                body.system = systemMsg.content;
            }
            const resp = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });
            if (!resp.ok) {
                throw new Error(`Anthropic API error (${resp.status}): ${await resp.text()}`);
            }
            const data = (await resp.json());
            const text = data.content?.map((c) => c.text).join('') || '';
            return {
                text,
                finishReason: data.stop_reason || 'end_turn',
                usage: {
                    promptTokens: data.usage?.input_tokens || 0,
                    completionTokens: data.usage?.output_tokens || 0,
                    totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
                },
            };
        },
        async stream(options) {
            const result = await this.generate(options);
            const text = result.text;
            const chunks = text.match(/.{1,16}/g) || [text];
            return (0, stream_1.createReadableTextStream)(chunks);
        },
    };
}
function createGeminiProvider(defaultModel = 'gemini-1.5-pro') {
    return {
        name: 'gemini',
        async generate(options) {
            const apiKey = process.env.GEMINI_API_KEY;
            const model = options.model || defaultModel;
            if (!apiKey) {
                return createMockProvider(model).generate(options);
            }
            const contents = options.messages.map((m) => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
            }));
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents }),
            });
            if (!resp.ok) {
                throw new Error(`Gemini API error (${resp.status}): ${await resp.text()}`);
            }
            const data = (await resp.json());
            const candidate = data.candidates?.[0];
            const text = candidate?.content?.parts?.[0]?.text || '';
            return {
                text,
                finishReason: candidate?.finishReason || 'STOP',
            };
        },
        async stream(options) {
            const result = await this.generate(options);
            const text = result.text;
            const chunks = text.match(/.{1,16}/g) || [text];
            return (0, stream_1.createReadableTextStream)(chunks);
        },
    };
}
function createOllamaProvider(defaultModel = 'llama3') {
    return {
        name: 'ollama',
        async generate(options) {
            const host = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
            const model = options.model || defaultModel;
            try {
                const resp = await fetch(`${host}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model,
                        messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
                        stream: false,
                    }),
                });
                if (resp.ok) {
                    const data = (await resp.json());
                    return {
                        text: data.message?.content || '',
                        finishReason: 'stop',
                    };
                }
            }
            catch {
                // fall back to mock
            }
            return createMockProvider(model).generate(options);
        },
        async stream(options) {
            const result = await this.generate(options);
            const chunks = result.text.match(/.{1,16}/g) || [result.text];
            return (0, stream_1.createReadableTextStream)(chunks);
        },
    };
}
function createMockProvider(model = 'mock-model') {
    return {
        name: 'mock',
        async generate(options) {
            const lastUserMsg = [...options.messages].reverse().find((m) => m.role === 'user');
            const prompt = lastUserMsg?.content || '';
            // Check if user prompt matches any tool calling intent
            if (options.tools && options.tools.length > 0) {
                for (const tool of options.tools) {
                    if (prompt.toLowerCase().includes(tool.name.toLowerCase()) || prompt.toLowerCase().includes('search')) {
                        return {
                            text: `Calling tool ${tool.name}...`,
                            toolCalls: [
                                {
                                    id: `call_${Date.now()}`,
                                    type: 'function',
                                    function: {
                                        name: tool.name,
                                        arguments: { query: prompt },
                                    },
                                },
                            ],
                            finishReason: 'tool_calls',
                            usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
                        };
                    }
                }
            }
            const responseText = `[vista/ai (${model})] Response to: "${prompt}"`;
            return {
                text: responseText,
                finishReason: 'stop',
                usage: {
                    promptTokens: prompt.length,
                    completionTokens: responseText.length,
                    totalTokens: prompt.length + responseText.length,
                },
            };
        },
        async stream(options) {
            const res = await this.generate(options);
            const text = res.text;
            const chunks = text.match(/.{1,12}/g) || [text];
            return (0, stream_1.createReadableTextStream)(chunks);
        },
    };
}
