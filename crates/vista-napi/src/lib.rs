use napi_derive::napi;
use vista_transforms::{detect_client_directive_fast, has_client_directive};
use vista_transforms::naming;
use std::path::Path;

// ============================================================================
// Framework Identity & Integrity (baked into compiled .node binary)
// ============================================================================

/// Framework identity returned from the compiled binary.
/// JS uses this to verify that constants.ts matches the binary.
#[napi(object)]
pub struct FrameworkIdentity {
    /// Framework name (e.g. "vista")
    pub name: String,
    /// Integrity token: hash of all naming constants
    pub integrity_token: String,
    /// All naming constants for cross-verification
    pub url_prefix: String,
    pub static_chunks_path: String,
    pub mount_id_prefix: String,
    pub rsc_data_global: String,
    pub client_refs_global: String,
    pub build_id_global: String,
    pub build_dir: String,
    pub sse_endpoint: String,
    pub image_endpoint: String,
}

/// Get the framework identity from the compiled Rust binary.
/// This function returns values that are BAKED INTO the binary at compile time.
/// If someone renames constants.ts but doesn't recompile Rust → tokens won't match.
#[napi]
pub fn get_framework_identity() -> FrameworkIdentity {
    FrameworkIdentity {
        name: naming::FRAMEWORK_NAME.to_string(),
        integrity_token: format!("{:x}", naming::compute_integrity_token()),
        url_prefix: naming::URL_PREFIX.to_string(),
        static_chunks_path: naming::STATIC_CHUNKS_PATH.to_string(),
        mount_id_prefix: naming::MOUNT_ID_PREFIX.to_string(),
        rsc_data_global: naming::RSC_DATA_GLOBAL.to_string(),
        client_refs_global: naming::CLIENT_REFS_GLOBAL.to_string(),
        build_id_global: naming::BUILD_ID_GLOBAL.to_string(),
        build_dir: naming::BUILD_DIR.to_string(),
        sse_endpoint: naming::SSE_ENDPOINT.to_string(),
        image_endpoint: naming::IMAGE_ENDPOINT.to_string(),
    }
}

/// Verify that a JS-computed integrity token matches the Rust-compiled one.
/// Returns true if they match (framework is authentic), false if tampered.
#[napi]
pub fn verify_integrity(js_token: String) -> bool {
    let rust_token = format!("{:x}", naming::compute_integrity_token());
    rust_token == js_token
}

/// Check if source code contains 'use client' directive
#[napi]
pub fn is_client_component(source: String) -> bool {
    has_client_directive(&source)
}

/// Detailed analysis of client directive
#[napi]
pub fn analyze_client_directive(source: String) -> ClientDirectiveInfo {
    let result = detect_client_directive_fast(&source);
    ClientDirectiveInfo {
        is_client: result.is_client,
        directive_line: result.directive_line as u32,
    }
}

#[napi(object)]
pub struct ClientDirectiveInfo {
    pub is_client: bool,
    pub directive_line: u32,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct RouteNode {
    pub segment: String,
    pub kind: String, // "static", "dynamic", "catch-all"
    pub index_path: Option<String>, // page.tsx
    pub layout_path: Option<String>, // layout.tsx
    pub loading_path: Option<String>, // loading.tsx
    pub error_path: Option<String>, // error.tsx
    pub not_found_path: Option<String>, // not-found.tsx
    pub children: Vec<RouteNode>,
}

#[napi]
pub fn get_route_tree(app_dir: String) -> RouteNode {
    let root_path = Path::new(&app_dir);
    build_route_node(root_path, root_path)
}

fn build_route_node(dir_path: &Path, base_path: &Path) -> RouteNode {
    let dir_name = dir_path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "".to_string());

    let mut segment = dir_name.clone();
    let mut kind = "static".to_string();

    // Handle route groups (folder) - doesn't contribute to URL
    if segment.starts_with('(') && segment.ends_with(')') {
        kind = "group".to_string();
        segment = "".to_string(); // Groups don't add to the path
    }
    // Handle optional catch-all routes [[...slug]]
    else if segment.starts_with("[[...") && segment.ends_with("]]") {
        kind = "optional-catch-all".to_string();
        segment = segment[5..segment.len()-2].to_string();
    }
    // Handle dynamic routes [slug] and catch-all [...slug]
    else if segment.starts_with('[') && segment.ends_with(']') {
        if segment.starts_with("[...") {
            kind = "catch-all".to_string();
            segment = segment[4..segment.len()-1].to_string();
        } else {
            kind = "dynamic".to_string();
            segment = segment[1..segment.len()-1].to_string();
        }
    } else if dir_path == base_path {
        segment = "".to_string();
    }

    let mut node = RouteNode {
        segment,
        kind,
        index_path: None,
        layout_path: None,
        loading_path: None,
        error_path: None,
        not_found_path: None,
        children: Vec::new(),
    };

    if let Ok(entries) = std::fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();
            
            if path.is_dir() {
                // Skip hidden folders and node_modules
                if !file_name.starts_with('.') && file_name != "node_modules" && file_name != "[not-found]" {
                    let child_node = build_route_node(&path, base_path);
                    // Only add child if it has some content or children
                    if child_node.index_path.is_some() || child_node.layout_path.is_some() || !child_node.children.is_empty() {
                         node.children.push(child_node);
                    }
                }
            } else {
                // Check for special files
                let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                let full_path = path.to_string_lossy().to_string();
                
                // We only care about .tsx/.ts/.jsx/.js
                if !file_name.ends_with(".tsx") && !file_name.ends_with(".ts") && !file_name.ends_with(".jsx") && !file_name.ends_with(".js") {
                    continue;
                }

                match stem {
                    "page" | "index" => node.index_path = Some(full_path),
                    "layout" | "root" => node.layout_path = Some(full_path),
                    "loading" => node.loading_path = Some(full_path),
                    "error" => node.error_path = Some(full_path),
                    "not-found" => node.not_found_path = Some(full_path),
                    _ => {}
                }
            }
        }
    }
    
    // Sort children: static first, then dynamic, then catch-all
    node.children.sort_by(|a, b| {
        let order_a = match a.kind.as_str() { "static" => 0, "dynamic" => 1, _ => 2 };
        let order_b = match b.kind.as_str() { "static" => 0, "dynamic" => 1, _ => 2 };
        if order_a != order_b {
            return order_a.cmp(&order_b);
        }
        a.segment.cmp(&b.segment)
    });

    node
}

/// Version of vista-napi
#[napi]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// ============================================================================
// Metadata Detection Functions
// ============================================================================

/// Check if source file has a static metadata export
/// Looks for: `export const metadata` or `export const metadata:`
#[napi]
pub fn has_metadata_export(source: String) -> bool {
    // Simple regex-like pattern matching
    source.contains("export const metadata") || source.contains("export let metadata")
}

/// Check if source file has generateMetadata function
/// Looks for: `export function generateMetadata` or `export async function generateMetadata`
#[napi]
pub fn has_generate_metadata(source: String) -> bool {
    source.contains("export function generateMetadata") || 
    source.contains("export async function generateMetadata") ||
    source.contains("export const generateMetadata")
}

/// Metadata information extracted from a source file
#[napi(object)]
#[derive(Clone, Debug)]
pub struct MetadataInfo {
    pub has_static_metadata: bool,
    pub has_generate_metadata: bool,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct VistaImportResolutionInfo {
    pub normalized_request: String,
    pub subpath: String,
    pub candidate_bases: Vec<String>,
    pub resolved_path: Option<String>,
}

#[napi]
pub fn resolve_vista_source_import(
    request: String,
    package_root: String,
) -> Option<VistaImportResolutionInfo> {
    let resolution = vista_api::resolve_vista_source_import(&request, Path::new(&package_root))?;

    Some(VistaImportResolutionInfo {
        normalized_request: resolution.normalized_request,
        subpath: resolution.subpath,
        candidate_bases: resolution.candidate_bases,
        resolved_path: resolution.resolved_path,
    })
}

/// Analyze source file for metadata exports
#[napi]
pub fn analyze_metadata(source: String) -> MetadataInfo {
    MetadataInfo {
        has_static_metadata: has_metadata_export(source.clone()),
        has_generate_metadata: has_generate_metadata(source),
    }
}

// ============================================================================
// RSC (React Server Components) Functions
// ============================================================================

/// Scanned component info for NAPI
#[napi(object)]
#[derive(Clone, Debug)]
pub struct NapiScannedComponent {
    pub absolute_path: String,
    pub relative_path: String,
    pub is_client: bool,
    pub directive_line: u32,
    pub component_type: String,
    pub exports: Vec<String>,
    pub client_hooks_used: Vec<String>,
    pub has_metadata: bool,
    pub has_generate_metadata: bool,
}

/// Server component error for NAPI
#[napi(object)]
#[derive(Clone, Debug)]
pub struct NapiServerComponentError {
    pub file: String,
    pub message: String,
    pub hooks: Vec<String>,
}

/// Scan result for NAPI
#[napi(object)]
#[derive(Clone, Debug)]
pub struct NapiScanResult {
    pub client_components: Vec<NapiScannedComponent>,
    pub server_components: Vec<NapiScannedComponent>,
    pub pages: Vec<NapiScannedComponent>,
    pub layouts: Vec<NapiScannedComponent>,
    pub api_routes: Vec<NapiScannedComponent>,
    pub errors: Vec<NapiServerComponentError>,
    pub total_files: u32,
    pub scan_time_ms: u32,
}

fn convert_component(c: &vista_transforms::rsc::ScannedComponent) -> NapiScannedComponent {
    NapiScannedComponent {
        absolute_path: c.absolute_path.clone(),
        relative_path: c.relative_path.clone(),
        is_client: c.is_client,
        directive_line: c.directive_line as u32,
        component_type: format!("{:?}", c.component_type).to_lowercase(),
        exports: c.exports.clone(),
        client_hooks_used: c.client_hooks_used.clone(),
        has_metadata: c.has_metadata,
        has_generate_metadata: c.has_generate_metadata,
    }
}

/// Scan app directory and classify all components (Rust-powered, blazing fast)
#[napi]
pub fn rsc_scan_app(app_dir: String) -> NapiScanResult {
    let result = vista_transforms::rsc::scan_app_directory(&app_dir);
    
    NapiScanResult {
        client_components: result.client_components.iter().map(convert_component).collect(),
        server_components: result.server_components.iter().map(convert_component).collect(),
        pages: result.pages.iter().map(convert_component).collect(),
        layouts: result.layouts.iter().map(convert_component).collect(),
        api_routes: result.api_routes.iter().map(convert_component).collect(),
        errors: result.errors.iter().map(|e| NapiServerComponentError {
            file: e.file.clone(),
            message: e.message.clone(),
            hooks: e.hooks.clone(),
        }).collect(),
        total_files: result.total_files as u32,
        scan_time_ms: result.scan_time_ms as u32,
    }
}

/// Client module entry for NAPI
#[napi(object)]
#[derive(Clone, Debug)]
pub struct NapiClientModuleEntry {
    pub id: String,
    pub path: String,
    pub absolute_path: String,
    pub chunk_name: String,
    pub exports: Vec<String>,
    pub async_load: bool,
}

/// Client manifest for NAPI
#[napi(object)]
#[derive(Clone, Debug)]
pub struct NapiClientManifest {
    pub build_id: String,
    pub client_modules: Vec<NapiClientModuleEntry>,
}

/// Generate client manifest (Rust-powered)
#[napi]
pub fn rsc_generate_client_manifest(app_dir: String, build_id: String) -> NapiClientManifest {
    let manifest = vista_transforms::rsc::generate_client_manifest(&app_dir, &build_id);
    
    NapiClientManifest {
        build_id: manifest.build_id,
        client_modules: manifest.client_modules.values().map(|e| NapiClientModuleEntry {
            id: e.id.clone(),
            path: e.path.clone(),
            absolute_path: e.absolute_path.clone(),
            chunk_name: e.chunk_name.clone(),
            exports: e.exports.clone(),
            async_load: e.async_load,
        }).collect(),
    }
}

/// Route entry for NAPI
#[napi(object)]
#[derive(Clone, Debug)]
pub struct NapiRouteEntry {
    pub pattern: String,
    pub page_path: String,
    pub layout_paths: Vec<String>,
    pub loading_path: Option<String>,
    pub error_path: Option<String>,
    pub route_type: String,
}

/// Server module entry for NAPI
#[napi(object)]
#[derive(Clone, Debug)]
pub struct NapiServerModuleEntry {
    pub id: String,
    pub path: String,
    pub absolute_path: String,
    pub component_type: String,
    pub has_metadata: bool,
    pub has_generate_metadata: bool,
}

/// Server manifest for NAPI
#[napi(object)]
#[derive(Clone, Debug)]
pub struct NapiServerManifest {
    pub build_id: String,
    pub server_modules: Vec<NapiServerModuleEntry>,
    pub routes: Vec<NapiRouteEntry>,
}

/// Generate server manifest (Rust-powered)
#[napi]
pub fn rsc_generate_server_manifest(app_dir: String, build_id: String) -> NapiServerManifest {
    let manifest = vista_transforms::rsc::generate_server_manifest(&app_dir, &build_id);
    
    NapiServerManifest {
        build_id: manifest.build_id,
        server_modules: manifest.server_modules.values().map(|e| NapiServerModuleEntry {
            id: e.id.clone(),
            path: e.path.clone(),
            absolute_path: e.absolute_path.clone(),
            component_type: e.component_type.clone(),
            has_metadata: e.has_metadata,
            has_generate_metadata: e.has_generate_metadata,
        }).collect(),
        routes: manifest.routes.iter().map(|r| NapiRouteEntry {
            pattern: r.pattern.clone(),
            page_path: r.page_path.clone(),
            layout_paths: r.layout_paths.clone(),
            loading_path: r.loading_path.clone(),
            error_path: r.error_path.clone(),
            route_type: r.route_type.clone(),
        }).collect(),
    }
}

/// Client reference for NAPI
#[napi(object)]
#[derive(Clone, Debug)]
pub struct NapiClientReference {
    pub id: String,
    pub mount_id: String,
    pub chunk_url: String,
    pub export_name: String,
}

/// Pre-rendered component placeholder
#[napi(object)]
#[derive(Clone, Debug)]
pub struct NapiPrerenderedComponent {
    pub component_id: String,
    pub placeholder_html: String,
    pub estimated_height: u32,
}

/// Generate unique mount ID for client component
#[napi]
pub fn rsc_generate_mount_id() -> String {
    vista_transforms::rsc::generate_mount_id()
}

/// Reset mount ID counter (call at start of each request)
#[napi]
pub fn rsc_reset_mount_counter() {
    vista_transforms::rsc::reset_mount_counter()
}

/// Pre-render a client component to extract its structure for zero-CLS placeholders
/// This uses Rust to parse the TSX and generate accurate placeholder HTML
#[napi]
pub fn rsc_prerender_component(file_path: String) -> Option<NapiPrerenderedComponent> {
    vista_transforms::rsc::prerender_client_component(&file_path).map(|c| NapiPrerenderedComponent {
        component_id: c.component_id,
        placeholder_html: c.placeholder_html,
        estimated_height: c.estimated_height,
    })
}

/// Pre-render all client components in an app directory
/// Returns a map of component_id -> placeholder_html
#[napi]
pub fn rsc_prerender_all_components(app_dir: String) -> std::collections::HashMap<String, NapiPrerenderedComponent> {
    vista_transforms::rsc::prerender_all_client_components(&app_dir)
        .into_iter()
        .map(|(k, v)| (k, NapiPrerenderedComponent {
            component_id: v.component_id,
            placeholder_html: v.placeholder_html,
            estimated_height: v.estimated_height,
        }))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_client() {
        assert!(is_client_component("'use client';\n".to_string()));
        assert!(!is_client_component("export default function() {}".to_string()));
    }
}

