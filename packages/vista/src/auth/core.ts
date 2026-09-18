import crypto from 'node:crypto';

export interface AuthUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export interface AuthSession {
  user: AuthUser;
  expires: string;
}

export interface JWTPayload extends AuthSession {
  iat: number;
  exp: number;
}

export interface Account {
  provider: string;
  type: 'oauth' | 'oidc' | 'credentials';
  providerAccountId: string;
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  id_token?: string;
}

export interface Adapter {
  createUser?(user: AuthUser): Promise<AuthUser> | AuthUser;
  getUser?(id: string): Promise<AuthUser | null> | AuthUser | null;
  getUserByEmail?(email: string): Promise<AuthUser | null> | AuthUser | null;
  getUserByAccount?(provider: string, providerAccountId: string): Promise<AuthUser | null> | AuthUser | null;
  linkAccount?(userId: string, account: Account): Promise<void> | void;
}

export interface OAuthProvider {
  id: string;
  name: string;
  type: 'oauth';
  clientId: string;
  clientSecret: string;
  authorization: { url: string; params?: Record<string, string> };
  token: string;
  userinfo: string;
  profile(profile: any): AuthUser | Promise<AuthUser>;
}

export interface CredentialsProvider {
  id: string;
  name: string;
  type: 'credentials';
  credentials: Record<string, { label?: string; type?: string }>;
  authorize(credentials: Record<string, string>): Promise<AuthUser | null> | AuthUser | null;
}

export type AuthProvider = OAuthProvider | CredentialsProvider;

export interface AuthCallbacks {
  signIn?: (params: { user: AuthUser; account?: Account | null }) => boolean | Promise<boolean>;
  jwt?: (params: { token: JWTPayload; user?: AuthUser }) => JWTPayload | Promise<JWTPayload>;
  session?: (params: { session: AuthSession; token: JWTPayload }) => AuthSession | Promise<AuthSession>;
  redirect?: (params: { url: string; baseUrl: string }) => string | Promise<string>;
  authorized?: (params: { auth: AuthSession | null; request: Request }) => boolean | Response | Promise<boolean | Response>;
}

export interface AuthConfig {
  providers: AuthProvider[];
  adapter?: Adapter;
  secret?: string;
  session?: {
    strategy?: 'jwt' | 'database';
    maxAge?: number;
    cookieName?: string;
  };
  pages?: {
    signIn?: string;
    error?: string;
  };
  callbacks?: AuthCallbacks;
  trustHost?: boolean;
  basePath?: string;
}

export interface ResolvedAuthConfig extends AuthConfig {
  secret: string;
  session: { strategy: 'jwt' | 'database'; maxAge: number; cookieName: string };
  basePath: string;
}

export function hashPassword(password: string, salt?: string): string {
  const usedSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, usedSalt, 32).toString('hex');
  return `${usedSalt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 32);
  const actual = Buffer.from(hash, 'hex');
  if (derived.length !== actual.length) return false;
  return crypto.timingSafeEqual(derived, actual);
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptJwt(payload: JWTPayload, secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function decryptJwt(token: string, secret: string): JWTPayload | null {
  try {
    const buffer = Buffer.from(token, 'base64url');
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(secret), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    const payload = JSON.parse(json) as JWTPayload;
    if (payload.exp * 1000 < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken(32);
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export class MemoryAdapter implements Adapter {
  users = new Map<string, AuthUser>();
  accounts = new Map<string, string>();

  createUser(user: AuthUser): AuthUser {
    this.users.set(user.id, user);
    return user;
  }

  getUser(id: string): AuthUser | null {
    return this.users.get(id) ?? null;
  }

  getUserByEmail(email: string): AuthUser | null {
    return Array.from(this.users.values()).find((user) => user.email === email) ?? null;
  }

  getUserByAccount(provider: string, providerAccountId: string): AuthUser | null {
    const userId = this.accounts.get(`${provider}:${providerAccountId}`);
    return userId ? this.getUser(userId) : null;
  }

  linkAccount(userId: string, account: Account): void {
    this.accounts.set(`${account.provider}:${account.providerAccountId}`, userId);
  }
}

export function GitHub(options: { clientId?: string; clientSecret?: string }): OAuthProvider {
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

export function Google(options: { clientId?: string; clientSecret?: string } = {}): OAuthProvider {
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

export function Credentials(options: {
  id?: string;
  name?: string;
  credentials?: Record<string, { label?: string; type?: string }>;
  authorize: CredentialsProvider['authorize'];
}): CredentialsProvider {
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

export function resolveAuthConfig(config: AuthConfig): ResolvedAuthConfig {
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
