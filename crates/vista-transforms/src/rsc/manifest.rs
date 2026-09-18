//! RSC Manifest Generator
//! 
//! Generates manifests for React Server Components build system.
//! These manifests are used for:
//! - Client component hydration
//! - Route matching
//! - Code splitting

use std::collections::HashMap;
use std::path::Path;
use serde::{Serialize, Deserialize};
use super::scanner::{
    scan_app_directory, scan_project_client_components, ScannedComponent,
};
use crate::naming;

/// Entry in the client components manifest
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientModuleEntry {
    /// Unique module ID
    pub id: String,
    /// Relative path from app directory
    pub path: String,
    /// Absolute file path
    pub absolute_path: String,
    /// Generated chunk name for code splitting
    pub chunk_name: String,
    /// Exported names from this module
    pub exports: Vec<String>,
    /// Whether to load asynchronously
    pub async_load: bool,
}

/// Client components manifest
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientManifest {
    /// Build ID for cache invalidation
    pub build_id: String,
    /// Map of module ID to client component info
    pub client_modules: HashMap<String, ClientModuleEntry>,
    /// Map of file path to module ID for quick lookups
    pub path_to_id: HashMap<String, String>,
    /// SSR module mapping (server paths to client chunk URLs)
    pub ssr_module_mapping: HashMap<String, String>,
}

/// Entry in the server components manifest
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerModuleEntry {
    /// Unique module ID
    pub id: String,
    /// Relative path from app directory
    pub path: String,
    /// Absolute file path
    pub absolute_path: String,
    /// Component type
    pub component_type: String,
    /// Has static metadata export
    pub has_metadata: bool,
    /// Has generateMetadata function
    pub has_generate_metadata: bool,
    /// Client component dependencies
    pub client_dependencies: Vec<String>,
}

/// Route entry for the routes manifest
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteEntry {
    /// URL pattern (e.g., "/blog/:slug")
    pub pattern: String,
    /// Page component path
    pub page_path: String,
    /// Layout paths from root to this route
    pub layout_paths: Vec<String>,
    /// Loading component path
    pub loading_path: Option<String>,
    /// Error component path
    pub error_path: Option<String>,
    /// Route type
    pub route_type: String, // "static", "dynamic", "catch-all"
}

/// Server components manifest
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerManifest {
    /// Build ID
    pub build_id: String,
    /// Map of module ID to server component info
    pub server_modules: HashMap<String, ServerModuleEntry>,
    /// Map of path to module ID
    pub path_to_id: HashMap<String, String>,
    /// Discovered routes
    pub routes: Vec<RouteEntry>,
}

/// Generate a chunk name from a relative path
fn generate_chunk_name(relative_path: &str) -> String {
    relative_path
        .replace('\\', "/")
        .trim_end_matches(".tsx")
        .trim_end_matches(".ts")
        .trim_end_matches(".jsx")
        .trim_end_matches(".js")
        .chars()
        .map(|c| if c.is_alphanumeric() { c.to_ascii_lowercase() } else { '_' })
        .collect()
}

/// Generate a module ID from relative path
fn generate_module_id(relative_path: &str, is_client: bool) -> String {
    let normalized = relative_path
        .replace('\\', "/")
        .trim_end_matches(".tsx")
        .trim_end_matches(".ts")
        .trim_end_matches(".jsx")
        .trim_end_matches(".js")
        .to_string();
    
    if is_client {
        format!("client:{}", normalized)
    } else {
        format!("server:{}", normalized)
    }
}

fn is_reserved_internal_route(relative_path: &str) -> bool {
    relative_path
        .split(['/', '\\'])
        .any(|segment| segment == "[not-found]")
}

/// Build URL pattern from relative path
fn build_url_pattern(relative_path: &str) -> (String, String) {
    let mut pattern = String::from("/");
    let mut route_type = "static".to_string();
    
    // Get directory part (remove file name)
    let dir_path = Path::new(relative_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    
    if dir_path.is_empty() || dir_path == "." {
        return (pattern, route_type);
    }
    
    let segments: Vec<&str> = dir_path.split(['/', '\\']).filter(|s| !s.is_empty()).collect();
    
    for segment in segments {
        // Route group - doesn't contribute to URL
        if segment.starts_with('(') && segment.ends_with(')') {
            continue;
        }
        
        // Optional catch-all segment [[...slug]]
        if segment.starts_with("[[...") && segment.ends_with("]]") {
            let param_name = &segment[5..segment.len()-2];
            pattern.push_str(&format!(":{param_name}*?"));
            route_type = "optional-catch-all".to_string();
        }
        // Catch-all segment
        else if segment.starts_with("[...") && segment.ends_with(']') {
            let param_name = &segment[4..segment.len()-1];
            pattern.push_str(&format!(":{param_name}*"));
            route_type = "catch-all".to_string();
        }
        // Dynamic segment
        else if segment.starts_with('[') && segment.ends_with(']') {
            let param_name = &segment[1..segment.len()-1];
            pattern.push_str(&format!(":{param_name}"));
            if route_type != "catch-all" && route_type != "optional-catch-all" {
                route_type = "dynamic".to_string();
            }
        }
        // Static segment
        else {
            pattern.push_str(segment);
        }
        
        pattern.push('/');
    }
    
    // Remove trailing slash except for root
    if pattern.len() > 1 && pattern.ends_with('/') {
        pattern.pop();
    }
    
    (pattern, route_type)
}

fn client_manifest_from_components(
    client_components: impl IntoIterator<Item = ScannedComponent>,
    build_id: &str,
) -> ClientManifest {
    let mut client_modules = HashMap::new();
    let mut path_to_id = HashMap::new();
    let mut ssr_module_mapping = HashMap::new();

    for component in client_components {
        let module_id = generate_module_id(&component.relative_path, true);
        let chunk_name = generate_chunk_name(&component.relative_path);

        let entry = ClientModuleEntry {
            id: module_id.clone(),
            path: component.relative_path.clone(),
            absolute_path: component.absolute_path.clone(),
            chunk_name: chunk_name.clone(),
            exports: component.exports,
            async_load: false,
        };

        path_to_id.insert(component.relative_path.clone(), module_id.clone());
        path_to_id.insert(component.absolute_path.clone(), module_id.clone());
        ssr_module_mapping.insert(
            component.absolute_path,
            format!("{}{}.js", naming::STATIC_CHUNKS_PATH, chunk_name),
        );
        client_modules.insert(module_id, entry);
    }

    ClientManifest {
        build_id: build_id.to_string(),
        client_modules,
        path_to_id,
        ssr_module_mapping,
    }
}

/// Generate client manifest from the app directory plus sibling project roots.
///
/// `cwd` is the project root (parent of `app/` in the typical layout). Extra
/// directories such as `utils/` and `lib/` are scanned the same way TypeScript
/// `generateClientManifest` does.
pub fn generate_client_manifest_for_project(
    cwd: &str,
    app_dir: &str,
    build_id: &str,
) -> ClientManifest {
    let mut client_components = scan_app_directory(app_dir).client_components;
    client_components.extend(scan_project_client_components(cwd, app_dir));
    client_manifest_from_components(client_components, build_id)
}

/// Generate client manifest, treating the parent of `app_dir` as the project root.
pub fn generate_client_manifest(
    app_dir: &str,
    build_id: &str,
) -> ClientManifest {
    let app_path = Path::new(app_dir);
    let cwd = app_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or(app_path);
    generate_client_manifest_for_project(&cwd.to_string_lossy(), app_dir, build_id)
}

/// Generate server manifest from scan result
pub fn generate_server_manifest(
    app_dir: &str,
    build_id: &str,
) -> ServerManifest {
    let scan_result = scan_app_directory(app_dir);
    
    let mut server_modules = HashMap::new();
    let mut path_to_id = HashMap::new();
    let mut routes = Vec::new();
    
    // Process server components
    for component in &scan_result.server_components {
        let module_id = generate_module_id(&component.relative_path, false);
        
        let entry = ServerModuleEntry {
            id: module_id.clone(),
            path: component.relative_path.clone(),
            absolute_path: component.absolute_path.clone(),
            component_type: format!("{:?}", component.component_type).to_lowercase(),
            has_metadata: component.has_metadata,
            has_generate_metadata: component.has_generate_metadata,
            client_dependencies: vec![], // Would need import analysis
        };
        
        path_to_id.insert(component.relative_path.clone(), module_id.clone());
        path_to_id.insert(component.absolute_path.clone(), module_id.clone());
        server_modules.insert(module_id, entry);
    }
    
    // Build routes from pages
    for page in &scan_result.pages {
        if is_reserved_internal_route(&page.relative_path) {
            continue;
        }

        let (pattern, route_type) = build_url_pattern(&page.relative_path);
        
        // Find layouts for this route
        let mut layout_paths = Vec::new();
        let page_dir = Path::new(&page.relative_path).parent();
        
        if let Some(mut current_dir) = page_dir {
            let app_path = Path::new("");
            
            loop {
                // Look for layout in this directory
                for layout in &scan_result.layouts {
                    let layout_dir = Path::new(&layout.relative_path).parent();
                    if layout_dir == Some(current_dir) {
                        layout_paths.insert(0, layout.absolute_path.clone());
                        break;
                    }
                }
                
                if current_dir == app_path || current_dir.parent().is_none() {
                    break;
                }
                current_dir = current_dir.parent().unwrap_or(app_path);
            }
        }
        
        routes.push(RouteEntry {
            pattern,
            page_path: page.absolute_path.clone(),
            layout_paths,
            loading_path: None, // Would need to search for loading.tsx
            error_path: None,   // Would need to search for error.tsx
            route_type,
        });
    }
    
    // Sort routes: static first, then dynamic, then catch-all
    routes.sort_by(|a, b| {
        let order = |t: &str| match t {
            "static" => 0,
            "dynamic" => 1,
            "catch-all" => 2,
            _ => 3,
        };
        order(&a.route_type).cmp(&order(&b.route_type))
    });
    
    ServerManifest {
        build_id: build_id.to_string(),
        server_modules,
        path_to_id,
        routes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_build_url_pattern() {
        assert_eq!(build_url_pattern("page.tsx"), ("/".to_string(), "static".to_string()));
        assert_eq!(build_url_pattern("blog/page.tsx"), ("/blog".to_string(), "static".to_string()));
        assert_eq!(build_url_pattern("blog/[slug]/page.tsx"), ("/blog/:slug".to_string(), "dynamic".to_string()));
        assert_eq!(build_url_pattern("docs/[...path]/page.tsx"), ("/docs/:path*".to_string(), "catch-all".to_string()));
        assert_eq!(build_url_pattern("(marketing)/about/page.tsx"), ("/about".to_string(), "static".to_string()));
    }
    
    #[test]
    fn test_generate_chunk_name() {
        assert_eq!(generate_chunk_name("components/Button.tsx"), "components_button");
        assert_eq!(generate_chunk_name("app/blog/[slug]/page.tsx"), "app_blog__slug__page");
    }

    #[test]
    fn test_reserved_internal_route_detection() {
        assert!(is_reserved_internal_route("docs/[not-found]/page.tsx"));
        assert!(!is_reserved_internal_route("docs/[slug]/page.tsx"));
    }

    #[test]
    fn test_generate_client_manifest_includes_sibling_client_modules() {
        let root = std::env::temp_dir().join(format!(
            "vista-client-manifest-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let app_dir = root.join("app");
        std::fs::create_dir_all(&app_dir).unwrap();
        std::fs::create_dir_all(root.join("utils")).unwrap();
        std::fs::create_dir_all(root.join("lib")).unwrap();
        std::fs::write(
            app_dir.join("counter.tsx"),
            "'use client';\nexport default function Counter() { return null; }\n",
        )
        .unwrap();
        std::fs::write(
            root.join("utils").join("theme-toggle.tsx"),
            "'use client';\nexport function ThemeToggle() { return null; }\n",
        )
        .unwrap();
        std::fs::write(
            root.join("lib").join("widget.tsx"),
            "'use client';\nexport function Widget() { return null; }\n",
        )
        .unwrap();

        let manifest = generate_client_manifest_for_project(
            root.to_str().unwrap(),
            app_dir.to_str().unwrap(),
            "test-build",
        );
        let paths: Vec<String> = manifest
            .client_modules
            .values()
            .map(|entry| entry.path.clone())
            .collect();
        std::fs::remove_dir_all(&root).ok();

        assert!(paths.iter().any(|p| p.contains("counter")));
        assert!(
            paths.iter().any(|p| p.contains("theme-toggle")),
            "expected utils/theme-toggle in client manifest, got {paths:?}"
        );
        assert!(
            paths.iter().any(|p| p.contains("widget")),
            "expected lib/widget in client manifest, got {paths:?}"
        );
    }
}
