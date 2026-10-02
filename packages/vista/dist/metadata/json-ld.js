"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsonLd = jsonLd;
exports.JsonLd = JsonLd;
const jsx_runtime_1 = require("react/jsx-runtime");
function serializeJsonLd(data) {
    return JSON.stringify(data).replace(/</g, '\\u003c');
}
/** Serialize structured data for embedding in a script tag. */
function jsonLd(data) {
    return serializeJsonLd(data);
}
/**
 * Renders `<script type="application/ld+json">` with XSS-safe serialization.
 * Prefer this over hand-rolling dangerouslySetInnerHTML.
 */
function JsonLd({ data, id }) {
    return ((0, jsx_runtime_1.jsx)("script", { id: id, type: "application/ld+json", dangerouslySetInnerHTML: { __html: serializeJsonLd(data) } }));
}
