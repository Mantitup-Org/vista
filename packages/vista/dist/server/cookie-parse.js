"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeDecodeURIComponent = safeDecodeURIComponent;
/**
 * Decode a cookie value without throwing on malformed % sequences.
 */
function safeDecodeURIComponent(value) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return value;
    }
}
