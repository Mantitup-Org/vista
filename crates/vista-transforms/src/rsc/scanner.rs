//! RSC Scanner
//! 
//! High-performance Rust scanner for React Server Components.
//! Scans directories and classifies components as client or server.

use std::path::Path;
use std::fs;
use serde::{Serialize, Deserialize};
use crate::has_client_directive;

/// Component type classification
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ComponentType {
    Page,
    Layout,
    Loading,
    Error,
    NotFound,
    Component,
    Route,  // API route
}

impl ComponentType {
    pub fn from_filename(name: &str) -> Self {
        match name {
            "page" | "index" => ComponentType::Page,
            "layout" | "root" => ComponentType::Layout,
            "loading" => ComponentType::Loading,
            "error" => ComponentType::Error,
            "not-found" => ComponentType::NotFound,
            "route" => ComponentType::Route,
            _ => ComponentType::Component,
        }
    }
}

/// Information about a scanned component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedComponent {
    /// Absolute path to the file
    pub absolute_path: String,
    /// Path relative to app directory
    pub relative_path: String,
    /// Is this a client component (has 'use client' directive)
    pub is_client: bool,
    /// Line number of the directive (0 if not client)
    pub directive_line: usize,
    /// Component type (page, layout, etc.)
    pub component_type: ComponentType,
    /// Exported names from this module
    pub exports: Vec<String>,
    /// Client hooks/APIs used (for error detection)
    pub client_hooks_used: Vec<String>,
    /// Has metadata export
    pub has_metadata: bool,
    /// Has generateMetadata function
    pub has_generate_metadata: bool,
}

/// Error when using client features in server component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerComponentError {
    pub file: String,
    pub message: String,
    pub hooks: Vec<String>,
}

/// Result of scanning the app directory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub client_components: Vec<ScannedComponent>,
    pub server_components: Vec<ScannedComponent>,
    pub pages: Vec<ScannedComponent>,
    pub layouts: Vec<ScannedComponent>,
    pub api_routes: Vec<ScannedComponent>,
    pub errors: Vec<ServerComponentError>,
    /// Total files scanned
    pub total_files: usize,
    /// Time taken in milliseconds
    pub scan_time_ms: u64,
}

/// Client-only hooks that require 'use client' directive
const CLIENT_HOOKS: &[&str] = &[
    "useState", "useEffect", "useLayoutEffect", "useReducer", "useRef",
    "useImperativeHandle", "useCallback", "useMemo", "useContext",
    "useDebugValue", "useDeferredValue", "useTransition", "useId",
    "useSyncExternalStore", "useInsertionEffect",
];

/// Client-only APIs
const CLIENT_APIS: &[&str] = &[
    "createContext", "forwardRef", "memo", "lazy", "startTransition",
    "useFormStatus", "useFormState", "useOptimistic",
];

/// Detect client hooks used in source.
///
/// Matches a call or generic (`useState(` / `useState<`) on an identifier
/// boundary, and ignores comments and string literals so a mention in a
/// comment does not mark a Server Component as invalid.
fn detect_client_hooks(source: &str) -> Vec<String> {
    let source = mask_non_code(source);
    let mut used = Vec::new();

    for hook in CLIENT_HOOKS {
        if has_ident_call(&source, hook) {
            used.push((*hook).to_string());
        }
    }

    for api in CLIENT_APIS {
        if has_ident_call(&source, api) {
            used.push((*api).to_string());
        }
    }

    if ["onClick", "onChange", "onSubmit", "onFocus"]
        .iter()
        .any(|name| has_ident_followed_by(&source, name, b'='))
    {
        used.push("event handlers".to_string());
    }

    used
}

fn mask_non_code(source: &str) -> String {
    let chars: Vec<char> = source.chars().collect();
    let mut out = String::with_capacity(source.len());
    let mut index = 0;
    while index < chars.len() {
        if chars[index] == '/' && chars.get(index + 1) == Some(&'/') {
            while index < chars.len() && chars[index] != '\n' {
                out.push(' ');
                index += 1;
            }
            continue;
        }
        if chars[index] == '/' && chars.get(index + 1) == Some(&'*') {
            out.push(' ');
            out.push(' ');
            index += 2;
            while index + 1 < chars.len() && !(chars[index] == '*' && chars[index + 1] == '/') {
                out.push(if chars[index] == '\n' { '\n' } else { ' ' });
                index += 1;
            }
            if index < chars.len() {
                out.push(' ');
                index += 1;
            }
            if index < chars.len() {
                out.push(' ');
                index += 1;
            }
            continue;
        }
        if matches!(chars[index], '\'' | '"' | '`') {
            let quote = chars[index];
            out.push(' ');
            index += 1;
            while index < chars.len() && chars[index] != quote {
                if chars[index] == '\\' && index + 1 < chars.len() {
                    out.push(' ');
                    out.push(' ');
                    index += 2;
                    continue;
                }
                if chars[index] == '\n' && quote != '`' {
                    break;
                }
                out.push(if chars[index] == '\n' { '\n' } else { ' ' });
                index += 1;
            }
            if index < chars.len() {
                out.push(' ');
                index += 1;
            }
            continue;
        }
        out.push(chars[index]);
        index += 1;
    }
    out
}

fn has_ident_call(source: &str, name: &str) -> bool {
    let bytes = source.as_bytes();
    let name_bytes = name.as_bytes();
    let mut index = 0;
    while index + name_bytes.len() <= bytes.len() {
        if &bytes[index..index + name_bytes.len()] == name_bytes {
            let prev_ok = index == 0 || !is_ident_byte(bytes[index - 1]);
            let mut cursor = index + name_bytes.len();
            while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
                cursor += 1;
            }
            let next_ok = matches!(bytes.get(cursor), Some(b'(') | Some(b'<'));
            if prev_ok && next_ok {
                return true;
            }
        }
        index += 1;
    }
    false
}

fn has_ident_followed_by(source: &str, name: &str, next: u8) -> bool {
    let bytes = source.as_bytes();
    let name_bytes = name.as_bytes();
    let mut index = 0;
    while index + name_bytes.len() < bytes.len() {
        if &bytes[index..index + name_bytes.len()] == name_bytes {
            let prev_ok = index == 0 || !is_ident_byte(bytes[index - 1]);
            if prev_ok && bytes[index + name_bytes.len()] == next {
                return true;
            }
        }
        index += 1;
    }
    false
}

fn is_ident_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'$'
}

/// Extract export names from source
fn extract_exports(source: &str) -> Vec<String> {
    let mut exports = Vec::new();
    
    // export default
    if source.contains("export default") {
        exports.push("default".to_string());
    }
    
    // export function Name or export const Name
    for line in source.lines() {
        let trimmed = line.trim();
        
        if trimmed.starts_with("export function ") || trimmed.starts_with("export async function ") {
            if let Some(name) = extract_identifier(trimmed, "function ") {
                exports.push(name);
            }
        } else if trimmed.starts_with("export const ") {
            if let Some(name) = extract_identifier(trimmed, "const ") {
                exports.push(name);
            }
        } else if trimmed.starts_with("export class ") {
            if let Some(name) = extract_identifier(trimmed, "class ") {
                exports.push(name);
            }
        }
    }
    
    exports
}

/// Helper to extract identifier after a keyword
fn extract_identifier(line: &str, after: &str) -> Option<String> {
    if let Some(pos) = line.find(after) {
        let rest = &line[pos + after.len()..];
        let name: String = rest.chars()
            .take_while(|c| c.is_alphanumeric() || *c == '_')
            .collect();
        if !name.is_empty() {
            return Some(name);
        }
    }
    None
}

/// True when the file exports a binding with this exact name.
pub fn has_export_binding(source: &str, name: &str) -> bool {
    source.lines().any(|line| line_exports_binding(line, name))
}

fn line_exports_binding(line: &str, name: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.starts_with("//") || trimmed.starts_with('*') {
        return false;
    }
    let Some(rest) = trimmed.strip_prefix("export ") else {
        return false;
    };
    let rest = rest.trim_start();
    let rest = rest.strip_prefix("default ").unwrap_or(rest).trim_start();
    let rest = rest.strip_prefix("async ").unwrap_or(rest).trim_start();
    let rest = rest
        .strip_prefix("const ")
        .or_else(|| rest.strip_prefix("let "))
        .or_else(|| rest.strip_prefix("function "))
        .unwrap_or(rest)
        .trim_start();
    let Some(after) = rest.strip_prefix(name) else {
        return false;
    };
    after
        .chars()
        .next()
        .map(|ch| !ch.is_ascii_alphanumeric() && ch != '_' && ch != '$')
        .unwrap_or(true)
}

/// Check for metadata exports
pub fn has_metadata_export(source: &str) -> bool {
    has_export_binding(source, "metadata")
}

pub fn has_generate_metadata(source: &str) -> bool {
    has_export_binding(source, "generateMetadata")
}

fn is_reserved_internal_route(relative_path: &str) -> bool {
    relative_path
        .split(['/', '\\'])
        .any(|segment| segment == "[not-found]")
}

/// Top-level directories that never contain app `'use client'` modules.
/// Mirrors `PROJECT_CLIENT_SCAN_SKIP` in packages/vista/src/build/rsc/client-manifest.ts.
const PROJECT_CLIENT_SCAN_SKIP: &[&str] = &[
    "node_modules",
    ".vista",
    ".flash",
    "dist",
    "public",
    "coverage",
    "build",
    "out",
];

/// A project-root directory that may contain `'use client'` modules.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClientScanRoot {
    pub dir: String,
    pub prefix: String,
}

fn should_skip_scan_dir(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules"
}

pub(crate) fn same_path(left: &Path, right: &Path) -> bool {
    if left == right {
        return true;
    }
    match (fs::canonicalize(left), fs::canonicalize(right)) {
        (Ok(a), Ok(b)) => a == b,
        _ => {
            let normalize = |p: &Path| {
                p.to_string_lossy()
                    .replace('\\', "/")
                    .trim_end_matches('/')
                    .to_lowercase()
            };
            normalize(left) == normalize(right)
        }
    }
}

pub(crate) fn is_same_or_inside(path: &Path, ancestor: &Path) -> bool {
    if same_path(path, ancestor) {
        return true;
    }
    match (fs::canonicalize(path), fs::canonicalize(ancestor)) {
        (Ok(resolved), Ok(root)) => resolved.starts_with(&root),
        _ => {
            let normalize = |p: &Path| {
                p.to_string_lossy()
                    .replace('\\', "/")
                    .trim_end_matches('/')
                    .to_lowercase()
            };
            let child = normalize(path);
            let parent = normalize(ancestor);
            child == parent || child.starts_with(&format!("{parent}/"))
        }
    }
}

/// Top-level app directories that may contain `'use client'` modules.
/// Discovery is directory membership, not the import graph, so `utils/`,
/// `lib/`, and `src/` have to be scanned explicitly or they never enter
/// the React Client Manifest.
pub fn discover_project_client_roots(cwd: &str) -> Vec<ClientScanRoot> {
    let cwd_path = Path::new(cwd);
    let entries = match fs::read_dir(cwd_path) {
        Ok(entries) => entries,
        Err(_) => return Vec::new(),
    };

    let mut roots = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || PROJECT_CLIENT_SCAN_SKIP.contains(&name.as_str()) {
            continue;
        }
        roots.push(ClientScanRoot {
            dir: path.to_string_lossy().to_string(),
            prefix: format!("{}/", name.replace('\\', "/")),
        });
    }
    roots
}

/// Scan a single file
fn scan_file(path: &Path, scan_root: &Path, path_prefix: &str) -> Option<ScannedComponent> {
    let source = fs::read_to_string(path).ok()?;
    let relative_base = path.strip_prefix(scan_root).ok()?;
    let relative_base = relative_base.to_string_lossy().replace('\\', "/");
    let relative_path = format!("{path_prefix}{relative_base}");
    
    let file_stem = path.file_stem()?.to_str()?;
    let component_type = ComponentType::from_filename(file_stem);
    
    let is_client = has_client_directive(&source);
    let directive_line = if is_client {
        source.lines()
            .enumerate()
            .find(|(_, line)| {
                let trimmed = line.trim();
                trimmed.starts_with("'use client'") || trimmed.starts_with("\"use client\"")
            })
            .map(|(i, _)| i + 1)
            .unwrap_or(1)
    } else {
        0
    };
    
    Some(ScannedComponent {
        absolute_path: path.to_string_lossy().to_string(),
        relative_path,
        is_client,
        directive_line,
        component_type,
        exports: extract_exports(&source),
        client_hooks_used: detect_client_hooks(&source),
        has_metadata: has_metadata_export(&source),
        has_generate_metadata: has_generate_metadata(&source),
    })
}

/// Scan directory recursively
fn scan_directory_recursive(
    dir: &Path,
    scan_root: &Path,
    path_prefix: &str,
    components: &mut Vec<ScannedComponent>,
    errors: &mut Vec<ServerComponentError>,
    collect_server_errors: bool,
    skip_inside: Option<&Path>,
) {
    if let Some(skip) = skip_inside {
        if is_same_or_inside(dir, skip) {
            return;
        }
    }

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    
    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        
        if path.is_dir() {
            if !should_skip_scan_dir(&file_name) {
                scan_directory_recursive(
                    &path,
                    scan_root,
                    path_prefix,
                    components,
                    errors,
                    collect_server_errors,
                    skip_inside,
                );
            }
        } else if path.is_file() {
            if let Some(skip) = skip_inside {
                if is_same_or_inside(&path, skip) {
                    continue;
                }
            }
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if !["ts", "tsx", "js", "jsx"].contains(&ext) {
                continue;
            }
            
            if let Some(component) = scan_file(&path, scan_root, path_prefix) {
                if collect_server_errors
                    && !component.is_client
                    && !component.client_hooks_used.is_empty()
                {
                    errors.push(ServerComponentError {
                        file: component.relative_path.clone(),
                        message: format!(
                            "Using {} in a Server Component. Add 'use client' to make it a Client Component.",
                            component.client_hooks_used.join(", ")
                        ),
                        hooks: component.client_hooks_used.clone(),
                    });
                }
                
                components.push(component);
            }
        }
    }
}

/// Scan a directory for `'use client'` modules, prefixing relative paths.
pub fn scan_client_components_in_dir(dir: &str, path_prefix: &str) -> Vec<ScannedComponent> {
    scan_client_components_in_dir_skipping(dir, path_prefix, Path::new(""))
}

fn scan_client_components_in_dir_skipping(
    dir: &str,
    path_prefix: &str,
    skip_inside: &Path,
) -> Vec<ScannedComponent> {
    let scan_root = Path::new(dir);
    let mut components = Vec::new();
    let mut errors = Vec::new();
    let skip = if skip_inside.as_os_str().is_empty() {
        None
    } else {
        Some(skip_inside)
    };
    scan_directory_recursive(
        scan_root,
        scan_root,
        path_prefix,
        &mut components,
        &mut errors,
        false,
        skip,
    );
    components.into_iter().filter(|c| c.is_client).collect()
}

/// Scan project-level extra roots (siblings of `app/`) for client components.
pub fn scan_project_client_components(cwd: &str, app_dir: &str) -> Vec<ScannedComponent> {
    let app_path = Path::new(app_dir);
    let mut client_components = Vec::new();
    for root in discover_project_client_roots(cwd) {
        let root_path = Path::new(&root.dir);
        if same_path(root_path, app_path) {
            continue;
        }
        client_components.extend(scan_client_components_in_dir_skipping(
            &root.dir,
            &root.prefix,
            app_path,
        ));
    }
    client_components
}

/// Scan the app directory and classify all components
pub fn scan_app_directory(app_dir: &str) -> ScanResult {
    let start = std::time::Instant::now();
    let app_path = Path::new(app_dir);
    
    let mut components = Vec::new();
    let mut errors = Vec::new();
    
    scan_directory_recursive(app_path, app_path, "", &mut components, &mut errors, true, None);
    
    let total_files = components.len();
    
    // Classify components
    let client_components: Vec<_> = components.iter()
        .filter(|c| c.is_client)
        .cloned()
        .collect();
    
    let server_components: Vec<_> = components.iter()
        .filter(|c| !c.is_client && c.component_type != ComponentType::Route)
        .cloned()
        .collect();
    
    let pages: Vec<_> = components.iter()
        .filter(|c| c.component_type == ComponentType::Page && !is_reserved_internal_route(&c.relative_path))
        .cloned()
        .collect();
    
    let layouts: Vec<_> = components.iter()
        .filter(|c| c.component_type == ComponentType::Layout)
        .cloned()
        .collect();
    
    let api_routes: Vec<_> = components.iter()
        .filter(|c| c.component_type == ComponentType::Route)
        .cloned()
        .collect();
    
    let scan_time_ms = start.elapsed().as_millis() as u64;
    
    ScanResult {
        client_components,
        server_components,
        pages,
        layouts,
        api_routes,
        errors,
        total_files,
        scan_time_ms,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_detect_client_hooks() {
        let source = r#"
            import { useState, useEffect } from 'react';
            
            export default function Counter() {
                const [count, setCount] = useState(0);
                useEffect(() => {}, []);
                return <div onClick={() => setCount(c => c + 1)}>{count}</div>;
            }
        "#;
        
        let hooks = detect_client_hooks(source);
        assert!(hooks.contains(&"useState".to_string()));
        assert!(hooks.contains(&"useEffect".to_string()));
        assert!(hooks.contains(&"event handlers".to_string()));
    }

    #[test]
    fn hook_mentions_in_comments_and_longer_names_are_ignored() {
        let source = r#"
            // useState( is only mentioned here
            const label = "onClick=";
            function myuseState() {}
            export default function Page() { return null; }
        "#;
        assert!(detect_client_hooks(source).is_empty());
    }

    #[test]
    fn metadata_export_requires_the_exact_binding_name() {
        assert!(has_metadata_export("export const metadata = { title: 'A' };"));
        assert!(has_generate_metadata("export async function generateMetadata() { return {}; }"));
        assert!(!has_metadata_export("export const metadataExtra = 1;"));
        assert!(!has_metadata_export("// export const metadata = {}"));
        assert!(!has_generate_metadata("export const generateMetadataFactory = () => {};"));
    }
    
    #[test]
    fn test_extract_exports() {
        let source = r#"
            export const metadata = { title: 'Test' };
            export function generateMetadata() {}
            export default function Page() {}
        "#;
        
        let exports = extract_exports(source);
        assert!(exports.contains(&"default".to_string()));
        assert!(exports.contains(&"metadata".to_string()));
        assert!(exports.contains(&"generateMetadata".to_string()));
    }
    
    #[test]
    fn test_component_type() {
        assert_eq!(ComponentType::from_filename("page"), ComponentType::Page);
        assert_eq!(ComponentType::from_filename("layout"), ComponentType::Layout);
        assert_eq!(ComponentType::from_filename("loading"), ComponentType::Loading);
        assert_eq!(ComponentType::from_filename("Button"), ComponentType::Component);
    }

    #[test]
    fn test_reserved_internal_route_detection() {
        assert!(is_reserved_internal_route("docs/[not-found]/page.tsx"));
        assert!(!is_reserved_internal_route("docs/[slug]/page.tsx"));
    }

    #[test]
    fn test_discover_project_client_roots_skips_build_artifacts() {
        let root = std::env::temp_dir().join(format!(
            "vista-client-roots-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("app")).unwrap();
        fs::create_dir_all(root.join("utils")).unwrap();
        fs::create_dir_all(root.join("node_modules")).unwrap();
        fs::create_dir_all(root.join("dist")).unwrap();
        fs::create_dir_all(root.join(".vista")).unwrap();

        let names: Vec<String> = discover_project_client_roots(root.to_str().unwrap())
            .into_iter()
            .map(|entry| entry.prefix)
            .collect();

        fs::remove_dir_all(&root).ok();

        assert!(names.contains(&"app/".to_string()));
        assert!(names.contains(&"utils/".to_string()));
        assert!(!names.iter().any(|name| name.starts_with("node_modules")));
        assert!(!names.iter().any(|name| name.starts_with("dist")));
        assert!(!names.iter().any(|name| name.starts_with(".vista")));
    }

    #[test]
    fn test_scan_project_client_components_outside_app() {
        let root = std::env::temp_dir().join(format!(
            "vista-client-scan-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let app_dir = root.join("app");
        fs::create_dir_all(app_dir.join("docs")).unwrap();
        fs::create_dir_all(root.join("utils")).unwrap();
        fs::write(
            app_dir.join("page.tsx"),
            "export default function Page() { return null; }\n",
        )
        .unwrap();
        fs::write(
            root.join("utils").join("theme-toggle.tsx"),
            "'use client';\nexport function ThemeToggle() { return null; }\n",
        )
        .unwrap();

        let extra = scan_project_client_components(
            root.to_str().unwrap(),
            app_dir.to_str().unwrap(),
        );
        let app_scan = scan_app_directory(app_dir.to_str().unwrap());
        fs::remove_dir_all(&root).ok();

        assert!(
            extra.iter().any(|c| c.relative_path.contains("theme-toggle")),
            "expected utils/theme-toggle in extra client scan, got {:?}",
            extra.iter().map(|c| c.relative_path.clone()).collect::<Vec<_>>()
        );
        assert!(
            !app_scan
                .client_components
                .iter()
                .any(|c| c.relative_path.contains("theme-toggle")),
            "app scan should stay app-only"
        );
    }

    #[test]
    fn test_src_app_layout_does_not_duplicate_app_client_modules() {
        let root = std::env::temp_dir().join(format!(
            "vista-src-app-scan-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let app_dir = root.join("src").join("app");
        fs::create_dir_all(&app_dir).unwrap();
        fs::create_dir_all(root.join("src").join("components")).unwrap();
        fs::write(
            app_dir.join("button.tsx"),
            "'use client';\nexport default function Button() { return null; }\n",
        )
        .unwrap();
        fs::write(
            root.join("src").join("components").join("toggle.tsx"),
            "'use client';\nexport function Toggle() { return null; }\n",
        )
        .unwrap();

        let extra = scan_project_client_components(
            root.to_str().unwrap(),
            app_dir.to_str().unwrap(),
        );
        fs::remove_dir_all(&root).ok();

        assert!(
            extra.iter().any(|c| c.relative_path.contains("toggle")),
            "expected src/components/toggle in extra scan, got {:?}",
            extra.iter().map(|c| c.relative_path.clone()).collect::<Vec<_>>()
        );
        assert!(
            !extra.iter().any(|c| c.relative_path.contains("button")),
            "src/app/button must not be rescanned via the src/ extra root, got {:?}",
            extra.iter().map(|c| c.relative_path.clone()).collect::<Vec<_>>()
        );
    }
}
