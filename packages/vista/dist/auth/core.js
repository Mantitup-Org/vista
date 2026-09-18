"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryAdapter = void 0;
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.randomToken = randomToken;
exports.encryptJwt = encryptJwt;
exports.decryptJwt = decryptJwt;
exports.pkcePair = pkcePair;
exports.GitHub = GitHub;
exports.Google = Google;
exports.Credentials = Credentials;
exports.resolveAuthConfig = resolveAuthConfig;
const node_crypto_1 = __importDefault(require("node:crypto"));
function hashPassword(password, salt) {
    const usedSalt = salt || node_crypto_1.default.randomBytes(16).toString('hex');
    const derived = node_crypto_1.default.scryptSync(password, usedSalt, 32).toString('hex');
    return `${usedSalt}:${derived}`;
}
function verifyPassword(password, stored) {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash)
        return false;
    const derived = node_crypto_1.default.scryptSync(password, salt, 32);
    const actual = Buffer.from(hash, 'hex');
    if (derived.length !== actual.length)
        return false;
    return node_crypto_1.default.timingSafeEqual(derived, actual);
}
function randomToken(bytes = 32) {
    return node_crypto_1.default.randomBytes(bytes).toString('base64url');
}
function deriveKey(secret) {
    return node_crypto_1.default.createHash('sha256').update(secret).digest();
}
function encryptJwt(payload, secret) {
    const iv = node_crypto_1.default.randomBytes(12);
    const cipher = node_crypto_1.default.createCipheriv('aes-256-gcm', deriveKey(secret), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}
function decryptJwt(token, secret) {
    try {
        const buffer = Buffer.from(token, 'base64url');
        const iv = buffer.subarray(0, 12);
        const tag = buffer.subarray(12, 28);
        const encrypted = buffer.subarray(28);
        const decipher = node_crypto_1.default.createDecipheriv('aes-256-gcm', deriveKey(secret), iv);
        decipher.setAuthTag(tag);
        const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
        const payload = JSON.parse(json);
        if (payload.exp * 1000 < Date.now()) {
            return null;
        }
        return payload;
    }
    catch {
        return null;
    }
}
function pkcePair() {
    const verifier = randomToken(32);
    const challenge = node_crypto_1.default.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}
class MemoryAdapter {
    users = new Map();
    accounts = new Map();
    createUser(user) {
        this.users.set(user.id, user);
        return user;
    }
    getUser(id) {
        return this.users.get(id) ?? null;
    }
    getUserByEmail(email) {
        return Array.from(this.users.values()).find((user) => user.email === email) ?? null;
    }
    getUserByAccount(provider, providerAccountId) {
        const userId = this.accounts.get(`${provider}:${providerAccountId}`);
        return userId ? this.getUser(userId) : null;
    }
    linkAccount(userId, account) {
        this.accounts.set(`${account.provider}:${account.providerAccountId}`, userId);
    }
}
exports.MemoryAdapter = MemoryAdapter;
function GitHub(options) {
    return {
        id: 'github',
        name: 'GitHub',
        type: 'oauth',
        clientId: options.clientId || process.env.AUTH_GITHUB_ID || process.env.GITHUB_ID || '',
        clientSecret: options.clientSecret || process.env.AUTH_GITHUB_SECRET || process.env.GITHUB_SECRET || '',
        authorization: {
            url: 'https://github.com/login/oauth/authorize',
            params: { scope: 'read:user user:email' },
        },
        token: 'https://github.com/login/oauth/access_token',
        userinfo: 'https://api.github.com/user',
        profile(profile) {
            return {
                id: String(profile.id),
                name: profile.name || profile.login,
                email: profile.email,
                image: profile.avatar_url,
            };
        },
    };
}
function Google(options = {}) {
    return {
        id: 'google',
        name: 'Google',
        type: 'oauth',
        clientId: options.clientId || process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_ID || '',
        clientSecret: options.clientSecret || process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_SECRET || '',
        authorization: {
            url: 'https://accounts.google.com/o/oauth2/v2/auth',
            params: { scope: 'openid email profile', response_type: 'code' },
        },
        token: 'https://oauth2.googleapis.com/token',
        userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
        profile(profile) {
            return {
                id: String(profile.sub || profile.id),
                name: profile.name,
                email: profile.email,
                image: profile.picture,
            };
        },
    };
}
function Credentials(options) {
    return {
        id: options.id || 'credentials',
        name: options.name || 'Credentials',
        type: 'credentials',
        credentials: options.credentials || {
            email: { label: 'Email', type: 'email' },
            password: { label: 'Password', type: 'password' },
        },
        authorize: options.authorize,
    };
}
function resolveAuthConfig(config) {
    const secret = config.secret || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret) {
        throw new Error('AUTH_SECRET is required. Set it in the environment or pass secret to VistaAuth().');
    }
    return {
        ...config,
        secret,
        basePath: config.basePath || '/api/auth',
        session: {
            strategy: config.session?.strategy || 'jwt',
            maxAge: config.session?.maxAge ?? 30 * 24 * 60 * 60,
            cookieName: config.session?.cookieName || 'vista.session-token',
        },
    };
}
