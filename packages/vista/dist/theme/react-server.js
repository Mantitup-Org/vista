"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTheme = exports.applyTheme = exports.ThemeProvider = exports.ThemeScript = void 0;
/**
 * React-server entry for `vista/theme`.
 *
 * ThemeScript is a real Server Component (inline blocking script).
 * ThemeProvider/useTheme are Client Components; the compile hook turns
 * `theme-provider` into a Flight client proxy under `--conditions react-server`.
 */
var theme_script_1 = require("./theme-script");
Object.defineProperty(exports, "ThemeScript", { enumerable: true, get: function () { return theme_script_1.ThemeScript; } });
var theme_provider_1 = require("./theme-provider");
Object.defineProperty(exports, "ThemeProvider", { enumerable: true, get: function () { return theme_provider_1.ThemeProvider; } });
Object.defineProperty(exports, "applyTheme", { enumerable: true, get: function () { return theme_provider_1.applyTheme; } });
Object.defineProperty(exports, "useTheme", { enumerable: true, get: function () { return theme_provider_1.useTheme; } });
