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
    authorization: {
        url: string;
        params?: Record<string, string>;
    };
    token: string;
    userinfo: string;
    profile(profile: any): AuthUser | Promise<AuthUser>;
}
export interface CredentialsProvider {
    id: string;
    name: string;
    type: 'credentials';
    credentials: Record<string, {
        label?: string;
        type?: string;
    }>;
    authorize(credentials: Record<string, string>): Promise<AuthUser | null> | AuthUser | null;
}
export type AuthProvider = OAuthProvider | CredentialsProvider;
export interface AuthCallbacks {
    signIn?: (params: {
        user: AuthUser;
        account?: Account | null;
    }) => boolean | Promise<boolean>;
    jwt?: (params: {
        token: JWTPayload;
        user?: AuthUser;
    }) => JWTPayload | Promise<JWTPayload>;
    session?: (params: {
        session: AuthSession;
        token: JWTPayload;
    }) => AuthSession | Promise<AuthSession>;
    redirect?: (params: {
        url: string;
        baseUrl: string;
    }) => string | Promise<string>;
    authorized?: (params: {
        auth: AuthSession | null;
        request: Request;
    }) => boolean | Response | Promise<boolean | Response>;
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
    session: {
        strategy: 'jwt' | 'database';
        maxAge: number;
        cookieName: string;
    };
    basePath: string;
}
export declare function hashPassword(password: string, salt?: string): string;
export declare function verifyPassword(password: string, stored: string): boolean;
export declare function randomToken(bytes?: number): string;
export declare function encryptJwt(payload: JWTPayload, secret: string): string;
export declare function decryptJwt(token: string, secret: string): JWTPayload | null;
export declare function pkcePair(): {
    verifier: string;
    challenge: string;
};
export declare class MemoryAdapter implements Adapter {
    users: Map<string, AuthUser>;
    accounts: Map<string, string>;
    createUser(user: AuthUser): AuthUser;
    getUser(id: string): AuthUser | null;
    getUserByEmail(email: string): AuthUser | null;
    getUserByAccount(provider: string, providerAccountId: string): AuthUser | null;
    linkAccount(userId: string, account: Account): void;
}
export declare function GitHub(options: {
    clientId?: string;
    clientSecret?: string;
}): OAuthProvider;
export declare function Google(options?: {
    clientId?: string;
    clientSecret?: string;
}): OAuthProvider;
export declare function Credentials(options: {
    id?: string;
    name?: string;
    credentials?: Record<string, {
        label?: string;
        type?: string;
    }>;
    authorize: CredentialsProvider['authorize'];
}): CredentialsProvider;
export declare function resolveAuthConfig(config: AuthConfig): ResolvedAuthConfig;
