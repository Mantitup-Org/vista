"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAnthropicModel = createAnthropicModel;
const tool_1 = require("../tool");
function formatMessagesForAnthropic(messages) {
    const result = [];
    for (const msg of messages) {
        if (msg.role === 'system') {
            // System prompt is handled separately in Anthropic
            continue;
        }
        if (msg.role === 'tool') {
            result.push({
                role: 'user',
                content: [
                    {
                        type: 'tool_result',
                        tool_use_id: msg.toolCallId || 'call_default',
                        content: msg.content,
                    },
                ],
            });
        }
        else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
            const contentBlocks = [];
            if (msg.content) {
                contentBlocks.push({ type: 'text', text: msg.content });
            }
            for (const tc of msg.toolCalls) {
                contentBlocks.push({
                    type: 'tool_use',
                    id: tc.id,
                    name: tc.name,
                    input: typeof tc.arguments === 'object' ? tc.arguments : JSON.parse(tc.arguments || '{}'),
                });
            }
            result.push({ role: 'assistant', content: contentBlocks });
        }
        else {
            result.push({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: msg.content,
            });
        }
    }
    return result;
}
function createAnthropicModel(options) {
    const baseURL = (options.baseURL ||
        process.env.ANTHROPIC_BASE_URL ||
        'https://api.anthropic.com/v1').replace(/\/+$/, '');
    const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY || '';
    const modelName = options.model || 'claude-3-5-sonnet-20241022';
    return {
        provider: 'anthropic',
        modelName,
        async generateText(genOptions) {
            const url = `${baseURL}/messages`;
            const messages = formatMessagesForAnthropic(genOptions.messages);
            const body = {
                model: modelName,
                messages,
                max_tokens: genOptions.maxTokens || options.maxTokens || 4096,
                temperature: genOptions.temperature ?? options.temperature ?? 0.7,
            };
            if (genOptions.systemPrompt) {
                body.system = genOptions.systemPrompt;
            }
            if (genOptions.tools && genOptions.tools.length > 0) {
                body.tools = genOptions.tools.map(tool_1.formatToolForAnthropic);
            }
            const headers = {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                ...(options.headers || {}),
            };
            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: genOptions.abortSignal,
            });
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(`Anthropic API request failed [${res.status}]: ${errText}`);
            }
            const data = await res.json();
            let text = '';
            const toolCalls = [];
            if (Array.isArray(data.content)) {
                for (const block of data.content) {
                    if (block.type === 'text') {
                        text += block.text;
                    }
                    else if (block.type === 'tool_use') {
                        toolCalls.push({
                            id: block.id,
                            name: block.name,
                            arguments: block.input,
                        });
                    }
                }
            }
            return {
                text,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                finishReason: data.stop_reason || 'stop',
                usage: data.usage
                    ? {
                        promptTokens: data.usage.input_tokens || 0,
                        completionTokens: data.usage.output_tokens || 0,
                        totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
                    }
                    : undefined,
                raw: data,
            };
        },
        async *streamText(genOptions) {
            const url = `${baseURL}/messages`;
            const messages = formatMessagesForAnthropic(genOptions.messages);
            const body = {
                model: modelName,
                messages,
                max_tokens: genOptions.maxTokens || options.maxTokens || 4096,
                temperature: genOptions.temperature ?? options.temperature ?? 0.7,
                stream: true,
            };
            if (genOptions.systemPrompt) {
                body.system = genOptions.systemPrompt;
            }
            if (genOptions.tools && genOptions.tools.length > 0) {
                body.tools = genOptions.tools.map(tool_1.formatToolForAnthropic);
            }
            const headers = {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                ...(options.headers || {}),
            };
            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: genOptions.abortSignal,
            });
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(`Anthropic stream request failed [${res.status}]: ${errText}`);
            }
            if (!res.body) {
                throw new Error('ReadableStream not supported on fetch response');
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith('data: '))
                            continue;
                        const payload = trimmed.slice(6);
                        if (payload === '[DONE]')
                            break;
                        try {
                            const event = JSON.parse(payload);
                            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                                yield { type: 'text-delta', textDelta: event.delta.text };
                            }
                        }
                        catch {
                            // Ignore partial JSON parse errors
                        }
                    }
                }
            }
            finally {
                reader.releaseLock();
            }
            yield { type: 'done' };
        },
    };
}
