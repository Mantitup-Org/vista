export interface ReactClientReferenceManifestEntry {
    id: string | number;
    chunks: Array<string | number>;
    name: string;
}
export type ReactClientReferenceManifest = Record<string, ReactClientReferenceManifestEntry>;
export interface ReactServerConsumerManifestEntry {
    specifier?: string;
    id?: string | number;
    chunks?: Array<string | number>;
    name?: string;
}
export interface ReactServerConsumerManifest {
    moduleLoading?: {
        prefix: string;
        crossOrigin: string | null;
    };
    moduleMap?: Record<string, Record<string, ReactServerConsumerManifestEntry>>;
    serverModuleMap?: Record<string, unknown>;
}
/**
 * Flight encode looks up `file://...#ExportName`. Webpack may have keyed the
 * same module under a standalone copy, a different drive-letter case, or a
 * slightly different absolute prefix. Resolve those aliases at lookup time so
 * missing keys do not serialize as Flight `E{"digest":""}` rows.
 */
export declare function resolveReactClientManifestEntry(manifest: ReactClientReferenceManifest, key: string): ReactClientReferenceManifestEntry | undefined;
export declare function normalizeReactClientReferenceManifest(input: ReactClientReferenceManifest): ReactClientReferenceManifest;
export declare function normalizeReactServerConsumerManifest(input: ReactServerConsumerManifest): ReactServerConsumerManifest;
/**
 * React looks up `file://...#ExportName` in the Flight manifest and throws a
 * generic error when the key is missing. Wrap the manifest so the message names
 * the file and the scan-directory requirement.
 */
export declare function createGuardedReactClientManifest(manifest: ReactClientReferenceManifest): ReactClientReferenceManifest;
