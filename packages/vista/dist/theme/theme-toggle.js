'use client';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThemeToggle = ThemeToggle;
const jsx_runtime_1 = require("react/jsx-runtime");
const theme_provider_1 = require("./theme-provider");
function Icon(props) {
    return ((0, jsx_runtime_1.jsx)("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", className: "h-full w-full", "aria-hidden": "true", ...props }));
}
function SystemIcon() {
    return ((0, jsx_runtime_1.jsxs)(Icon, { children: [(0, jsx_runtime_1.jsx)("rect", { x: "3.5", y: "4.5", width: "17", height: "12", rx: "2" }), (0, jsx_runtime_1.jsx)("path", { d: "M8 19.5h8" })] }));
}
function SunIcon() {
    return ((0, jsx_runtime_1.jsxs)(Icon, { children: [(0, jsx_runtime_1.jsx)("circle", { cx: "12", cy: "12", r: "4" }), (0, jsx_runtime_1.jsx)("path", { d: "M12 3v2.2M12 18.8V21M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M3 12h2.2M18.8 12H21M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" })] }));
}
function MoonIcon() {
    return ((0, jsx_runtime_1.jsx)(Icon, { children: (0, jsx_runtime_1.jsx)("path", { d: "M16.5 13.5A7 7 0 0 1 10.2 4.4 7.2 7.2 0 1 0 19.6 14.8 7 7 0 0 1 16.5 13.5z" }) }));
}
const OPTIONS = [
    { value: 'system', label: 'System', icon: SystemIcon },
    { value: 'light', label: 'Light', icon: SunIcon },
    { value: 'dark', label: 'Dark', icon: MoonIcon },
];
function ThemeToggle({ compact = false, className }) {
    const { mounted, theme, setTheme } = (0, theme_provider_1.useTheme)();
    const rootClassName = [
        'inline-flex items-center gap-1 rounded-full border border-border/80 bg-panel-elevated/90 p-1 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur',
        className,
    ]
        .filter(Boolean)
        .join(' ');
    return ((0, jsx_runtime_1.jsx)("div", { className: rootClassName, "aria-label": "Theme switcher", children: OPTIONS.map((option) => {
            const isActive = theme === option.value;
            const IconNode = option.icon;
            return ((0, jsx_runtime_1.jsxs)("button", { type: "button", onClick: () => setTheme(option.value), className: `inline-flex items-center justify-center gap-2 rounded-full py-2 text-xs font-medium transition-colors ${isActive
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'} ${compact ? 'px-2.5' : 'px-3'}`, "aria-pressed": isActive, title: mounted ? option.label : undefined, children: [(0, jsx_runtime_1.jsx)("span", { className: "inline-flex h-3.5 w-3.5 items-center justify-center", children: (0, jsx_runtime_1.jsx)(IconNode, {}) }), !compact ? (0, jsx_runtime_1.jsx)("span", { children: option.label }) : null] }, option.value));
        }) }));
}
