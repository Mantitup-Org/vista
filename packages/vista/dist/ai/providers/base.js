"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseModelIdentifier = parseModelIdentifier;
exports.resolveModel = resolveModel;
const openai_1 = require("./openai");
const anthropic_1 = require("./anthropic");
const gemini_1 = require("./gemini");
const mock_1 = require("./mock");
function parseModelIdentifier(model) {
    const trimmed = model.trim();
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex !== -1) {
        const provider = trimmed.slice(0, colonIndex).toLowerCase();
        const modelName = trimmed.slice(colonIndex + 1);
        return { provider, modelName };
    }
    // Heuristic guessing if prefix omitted
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('gpt-') || lower.startsWith('o1-') || lower.startsWith('o3-')) {
        return { provider: 'openai', modelName: trimmed };
    }
    if (lower.startsWith('claude-')) {
        return { provider: 'anthropic', modelName: trimmed };
    }
    if (lower.startsWith('gemini-')) {
        return { provider: 'gemini', modelName: trimmed };
    }
    if (lower.startsWith('mock')) {
        return { provider: 'mock', modelName: trimmed };
    }
    // Default fallback
    return { provider: 'openai', modelName: trimmed };
}
function resolveModel(model, options = {}) {
    if (typeof model === 'object' && model !== null && 'generateText' in model) {
        return model;
    }
    if (typeof model !== 'string') {
        throw new Error('Model must be a model string or a LanguageModel implementation');
    }
    const { provider, modelName } = parseModelIdentifier(model);
    const modelOptions = {
        model: modelName,
        ...options,
    };
    switch (provider) {
        case 'openai':
            return (0, openai_1.createOpenAIModel)(modelOptions);
        case 'anthropic':
            return (0, anthropic_1.createAnthropicModel)(modelOptions);
        case 'gemini':
            return (0, gemini_1.createGeminiModel)(modelOptions);
        case 'ollama':
            return (0, openai_1.createOpenAIModel)({
                ...modelOptions,
                baseURL: options.baseURL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
                apiKey: options.apiKey || 'ollama',
            });
        case 'mock':
            return (0, mock_1.createMockModel)({
                modelName,
            });
        default:
            throw new Error(`Unsupported model provider "${provider}". Supported providers: openai, anthropic, gemini, ollama, mock.`);
    }
}
