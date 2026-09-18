'use client';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAuth = exports.AuthProvider = void 0;
exports.SessionProvider = SessionProvider;
exports.useSession = useSession;
exports.signIn = signIn;
exports.signOut = signOut;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const SessionContext = (0, react_1.createContext)(null);
function SessionProvider({ children, basePath = '/api/auth', }) {
    const [data, setData] = (0, react_1.useState)(null);
    const [status, setStatus] = (0, react_1.useState)('loading');
    const update = async () => {
        const response = await fetch(`${basePath}/session`);
        const json = await response.json();
        if (json?.user) {
            setData({ user: json.user, expires: json.expires || '' });
            setStatus('authenticated');
        }
        else {
            setData(null);
            setStatus('unauthenticated');
        }
    };
    (0, react_1.useEffect)(() => {
        void update();
    }, [basePath]);
    return (0, jsx_runtime_1.jsx)(SessionContext.Provider, { value: { data, status, update }, children: children });
}
function useSession() {
    const context = (0, react_1.useContext)(SessionContext);
    if (!context) {
        throw new Error('useSession must be used within a SessionProvider');
    }
    return context;
}
async function signIn(provider, options = {}, basePath = '/api/auth') {
    if (provider === 'credentials') {
        const csrfResponse = await fetch(`${basePath}/csrf`, { credentials: 'same-origin' });
        const csrfJson = (await csrfResponse.json());
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = `${basePath}/signin/credentials`;
        form.style.display = 'none';
        const fields = {
            ...options,
            csrfToken: csrfJson.csrfToken || '',
        };
        for (const [name, value] of Object.entries(fields)) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = name;
            input.value = value;
            form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
        return;
    }
    const params = new URLSearchParams(options);
    const target = provider ? `${basePath}/signin/${provider}?${params}` : `${basePath}/signin?${params}`;
    window.location.assign(target);
}
function signOut(basePath = '/api/auth') {
    window.location.assign(`${basePath}/signout`);
}
/** Back-compat aliases for the old demo AuthProvider. */
exports.AuthProvider = SessionProvider;
exports.useAuth = useSession;
