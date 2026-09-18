"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useIsActive = exports.useLinkStatus = exports.Link = exports.default = void 0;
var link_1 = require("./link");
Object.defineProperty(exports, "default", { enumerable: true, get: function () { return __importDefault(link_1).default; } });
Object.defineProperty(exports, "Link", { enumerable: true, get: function () { return link_1.Link; } });
Object.defineProperty(exports, "useLinkStatus", { enumerable: true, get: function () { return link_1.useLinkStatus; } });
Object.defineProperty(exports, "useIsActive", { enumerable: true, get: function () { return link_1.useIsActive; } });
