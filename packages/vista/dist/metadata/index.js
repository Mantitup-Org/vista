"use strict";
/**
 * Vista Metadata Module
 *
 * Re-exports all metadata-related types and utilities.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonLd = exports.jsonLd = exports.metadataRouteToResponse = exports.serializeSitemap = exports.serializeRobots = exports.manifest = exports.sitemap = exports.robots = exports.resolveParentTitleTemplate = exports.mergeMetadataChain = exports.deepMergeMetadata = exports.generateMetadataHtml = exports.MetadataRenderer = void 0;
__exportStar(require("./types"), exports);
var generate_1 = require("./generate");
Object.defineProperty(exports, "MetadataRenderer", { enumerable: true, get: function () { return generate_1.MetadataRenderer; } });
Object.defineProperty(exports, "generateMetadataHtml", { enumerable: true, get: function () { return generate_1.generateMetadataHtml; } });
var merge_1 = require("./merge");
Object.defineProperty(exports, "deepMergeMetadata", { enumerable: true, get: function () { return merge_1.deepMergeMetadata; } });
Object.defineProperty(exports, "mergeMetadataChain", { enumerable: true, get: function () { return merge_1.mergeMetadataChain; } });
Object.defineProperty(exports, "resolveParentTitleTemplate", { enumerable: true, get: function () { return merge_1.resolveParentTitleTemplate; } });
var routes_1 = require("./routes");
Object.defineProperty(exports, "robots", { enumerable: true, get: function () { return routes_1.robots; } });
Object.defineProperty(exports, "sitemap", { enumerable: true, get: function () { return routes_1.sitemap; } });
Object.defineProperty(exports, "manifest", { enumerable: true, get: function () { return routes_1.manifest; } });
Object.defineProperty(exports, "serializeRobots", { enumerable: true, get: function () { return routes_1.serializeRobots; } });
Object.defineProperty(exports, "serializeSitemap", { enumerable: true, get: function () { return routes_1.serializeSitemap; } });
Object.defineProperty(exports, "metadataRouteToResponse", { enumerable: true, get: function () { return routes_1.metadataRouteToResponse; } });
var json_ld_1 = require("./json-ld");
Object.defineProperty(exports, "jsonLd", { enumerable: true, get: function () { return json_ld_1.jsonLd; } });
Object.defineProperty(exports, "JsonLd", { enumerable: true, get: function () { return json_ld_1.JsonLd; } });
