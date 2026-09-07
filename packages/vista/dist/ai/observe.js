"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAgentObservation = onAgentObservation;
exports.emitAgentObservation = emitAgentObservation;
exports.estimateCostUsd = estimateCostUsd;
const listeners = new Set();
function onAgentObservation(listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
function emitAgentObservation(observation) {
    for (const listener of listeners) {
        try {
            listener(observation);
        }
        catch {
            // Observability must never break agent execution.
        }
    }
}
function estimateCostUsd(model, usage) {
    const normalized = model.toLowerCase();
    const rates = {
        'gpt-4o': { in: 2.5 / 1_000_000, out: 10 / 1_000_000 },
        'gpt-4o-mini': { in: 0.15 / 1_000_000, out: 0.6 / 1_000_000 },
        'claude-3-5-sonnet': { in: 3 / 1_000_000, out: 15 / 1_000_000 },
        'gemini-1.5-pro': { in: 1.25 / 1_000_000, out: 5 / 1_000_000 },
    };
    const matched = Object.keys(rates).find((key) => normalized.includes(key));
    if (!matched)
        return undefined;
    const rate = rates[matched];
    return Number((usage.inputTokens * rate.in + usage.outputTokens * rate.out).toFixed(6));
}
