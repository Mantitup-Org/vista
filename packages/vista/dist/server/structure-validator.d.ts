/**
 * Vista Structure Validator
 *
 * Deterministic, pure validation of the app/ directory structure.
 * Enforces Next.js-like conventions with strict error reporting.
 *
 * Issue codes are stable and consumed by the dev overlay, build output,
 * and any future tooling.
 */
export type IssueSeverity = 'error' | 'warning';
export type IssueCode = 'ROOT_MISSING' | 'ROOT_EXPORT_MISSING' | 'LAYOUT_FALLBACK_USED' | 'RESERVED_NOT_FOUND_PUBLIC' | 'ROUTE_PATTERN_CONFLICT' | 'ROUTE_PAGE_CONFLICT' | 'INVALID_SEGMENT_NAME' | 'INVALID_NOT_FOUND_OVERRIDE_TARGET' | 'MULTIPLE_NOT_FOUND_SOURCES' | 'METADATA_EXPORT_SHAPE_INVALID' | 'FILE_CONVENTION_VIOLATION';
export interface StructureIssue {
    code: IssueCode;
    severity: IssueSeverity;
    message: string;
    filePath?: string;
    fix?: string;
}
export interface StructureValidationResult {
    state: 'ok' | 'error';
    issues: StructureIssue[];
    routeGraph: RouteGraphNode[];
    timestamp: number;
}
export interface RouteGraphNode {
    segment: string;
    pattern: string;
    kind: 'static' | 'dynamic' | 'catch-all' | 'optional-catch-all' | 'group' | 'parallel' | 'interception' | 'reserved-internal';
    hasPage: boolean;
    hasLayout: boolean;
    children: RouteGraphNode[];
    filePath?: string;
}
export interface ValidateAppStructureInput {
    cwd: string;
    /** Optional notFoundRoute from the root module export. */
    notFoundRoute?: string;
}
export declare function validateAppStructure(input: ValidateAppStructureInput): StructureValidationResult;
