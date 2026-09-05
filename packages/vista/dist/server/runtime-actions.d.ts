type RegisterServerReferenceFn = (reference: any, id: string, exportName: string | null) => void;
export declare function setRegisterServerReference(fn: RegisterServerReferenceFn | null): void;
export declare function createExportServerReferenceId(filePath: string, exportName?: string): string;
export declare function createInlineServerActionId(filePath: string, ordinal: number, hint?: string): string;
export declare function registerInlineServerReference<T extends Function>(reference: T, id: string, exportName?: string): T;
export declare function registerServerActionModule(moduleExports: unknown, filePath: string): unknown;
export declare function resolveRegisteredServerReference(id: string): Function | undefined;
export {};
