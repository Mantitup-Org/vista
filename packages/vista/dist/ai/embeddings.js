"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.embedTexts = embedTexts;
exports.embedText = embedText;
exports.createEmbeddings = createEmbeddings;
const base_1 = require("./providers/base");
function resolveEmbedTarget(options = {}) {
    const identifier = (0, base_1.parseModelIdentifier)(options.model || 'openai:text-embedding-3-small');
    const provider = identifier.provider;
    const modelName = identifier.modelName || 'text-embedding-3-small';
    if (provider === 'nvidia' || provider === 'nim') {
        return {
            modelName,
            baseURL: (options.baseURL ||
                process.env.NVIDIA_BASE_URL ||
                process.env.NIM_BASE_URL ||
                'https://integrate.api.nvidia.com/v1').replace(/\/+$/, ''),
            apiKey: options.apiKey || process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY || '',
        };
    }
    if (provider === 'groq') {
        return {
            modelName,
            baseURL: (options.baseURL || process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
            apiKey: options.apiKey || process.env.GROQ_API_KEY || '',
        };
    }
    if (provider === 'ollama') {
        return {
            modelName,
            baseURL: (options.baseURL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1').replace(/\/+$/, ''),
            apiKey: options.apiKey || 'ollama',
        };
    }
    return {
        modelName,
        baseURL: (options.baseURL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
        apiKey: options.apiKey || process.env.OPENAI_API_KEY || '',
    };
}
async function embedTexts(texts, options = {}) {
    const target = resolveEmbedTarget(options);
    const response = await fetch(`${target.baseURL}/embeddings`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(target.apiKey ? { Authorization: `Bearer ${target.apiKey}` } : {}),
        },
        body: JSON.stringify({
            model: target.modelName,
            input: texts,
        }),
    });
    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Embedding request failed (${response.status}): ${detail || response.statusText}`);
    }
    const json = (await response.json());
    const rows = [...(json.data || [])].sort((left, right) => (left.index || 0) - (right.index || 0));
    return rows.map((row) => row.embedding || []);
}
async function embedText(text, options = {}) {
    const [vector] = await embedTexts([text], options);
    return vector || [];
}
function createEmbeddings(options = {}) {
    return {
        embedText: (text) => embedText(text, options),
        embedTexts: (texts) => embedTexts(texts, options),
    };
}
