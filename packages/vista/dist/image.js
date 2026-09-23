"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getImageProps = exports.getImgProps = exports.Image = exports.default = void 0;
// Backward-compatible entrypoint. Canonical implementation lives in `src/image/index.tsx`.
var index_1 = require("./image/index");
Object.defineProperty(exports, "default", { enumerable: true, get: function () { return __importDefault(index_1).default; } });
var index_2 = require("./image/index");
Object.defineProperty(exports, "Image", { enumerable: true, get: function () { return index_2.Image; } });
Object.defineProperty(exports, "getImgProps", { enumerable: true, get: function () { return index_2.getImgProps; } });
Object.defineProperty(exports, "getImageProps", { enumerable: true, get: function () { return index_2.getImageProps; } });
