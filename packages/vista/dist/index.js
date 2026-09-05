"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callServer = exports.useRSCRouter = exports.RSCRouterContext = exports.RSCRouter = exports.Client = exports.initializeHydration = exports.hydrateClientComponents = exports.generateMetadataHead = exports.Head = exports.Script = exports.dynamic = exports.useSelectedLayoutSegments = exports.useSelectedLayoutSegment = exports.useParams = exports.useSearchParams = exports.usePathname = exports.useRouter = void 0;
__exportStar(require("./router"), exports);
__exportStar(require("./components"), exports);
__exportStar(require("./auth"), exports);
__exportStar(require("./types"), exports);
__exportStar(require("./dev-error"), exports);
// Client-side features
var router_1 = require("./client/router");
Object.defineProperty(exports, "useRouter", { enumerable: true, get: function () { return router_1.useRouter; } });
var navigation_1 = require("./client/navigation");
Object.defineProperty(exports, "usePathname", { enumerable: true, get: function () { return navigation_1.usePathname; } });
Object.defineProperty(exports, "useSearchParams", { enumerable: true, get: function () { return navigation_1.useSearchParams; } });
Object.defineProperty(exports, "useParams", { enumerable: true, get: function () { return navigation_1.useParams; } });
Object.defineProperty(exports, "useSelectedLayoutSegment", { enumerable: true, get: function () { return navigation_1.useSelectedLayoutSegment; } });
Object.defineProperty(exports, "useSelectedLayoutSegments", { enumerable: true, get: function () { return navigation_1.useSelectedLayoutSegments; } });
var dynamic_1 = require("./client/dynamic");
Object.defineProperty(exports, "dynamic", { enumerable: true, get: function () { return __importDefault(dynamic_1).default; } });
var script_1 = require("./client/script");
Object.defineProperty(exports, "Script", { enumerable: true, get: function () { return __importDefault(script_1).default; } });
var head_1 = require("./client/head");
Object.defineProperty(exports, "Head", { enumerable: true, get: function () { return __importDefault(head_1).default; } });
Object.defineProperty(exports, "generateMetadataHead", { enumerable: true, get: function () { return head_1.generateMetadataHead; } });
// Font exports
__exportStar(require("./font/index"), exports);
// Metadata exports (Next.js compatible)
__exportStar(require("./metadata"), exports);
// RSC (React Server Components) exports
var hydration_1 = require("./client/hydration");
Object.defineProperty(exports, "hydrateClientComponents", { enumerable: true, get: function () { return hydration_1.hydrateClientComponents; } });
Object.defineProperty(exports, "initializeHydration", { enumerable: true, get: function () { return hydration_1.initializeHydration; } });
var client_1 = require("./components/client");
Object.defineProperty(exports, "Client", { enumerable: true, get: function () { return client_1.Client; } });
var rsc_router_1 = require("./client/rsc-router");
Object.defineProperty(exports, "RSCRouter", { enumerable: true, get: function () { return rsc_router_1.RSCRouter; } });
Object.defineProperty(exports, "RSCRouterContext", { enumerable: true, get: function () { return rsc_router_1.RSCRouterContext; } });
Object.defineProperty(exports, "useRSCRouter", { enumerable: true, get: function () { return rsc_router_1.useRSCRouter; } });
var server_actions_1 = require("./client/server-actions");
Object.defineProperty(exports, "callServer", { enumerable: true, get: function () { return server_actions_1.callServer; } });
// AI Framework
__exportStar(require("./ai"), exports);
