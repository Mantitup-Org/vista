use flash_tasks::TaskGraph;
use flash_tasks_env::parse_env;
use flash_tasks_fs::{read_file, walk_files_filtered, write_file};
use flashpack_analyze::BundleGraph;
use flashpack_browser::{preload_list, ChunkGraph};
use flashpack_css::{classify_css, collect_imports, CssPipeline};
use flashpack_ecmascript::{directives, import_specifiers};
use flashpack_ecmascript_hmr_protocol::FlashHmrMessage;
use flashpack_ecmascript_plugins::plugin_count;
use flashpack_ecmascript_runtime::{module_url, RuntimeManifest};
use flashpack_env::{client_public, parse_env_file};
use flashpack_image::sniff_image;
use flashpack_json::{is_json_asset, json_module};
use flashpack_mdx::{compile_markdown, supported_extensions};
use flashpack_nft::specifiers;
use flashpack_nodejs::from_package_main;
use flashpack_resolve::resolve_module;
use flashpack_static::content_type;
use flashpack_swc_utils::transform_for_path;
use flashpack_trace_server::{TraceLog, TraceRecord};
use flashpack_trace_utils::{format_record, group, FlashTraceRecord};
use flashpack_tracing::Tracer;
use flashpack_wasm::{flashpack_wasm_version, inspect_wasm};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

const SKIP_DIRS: &[&str] = &[
    ".git",
    ".vista",
    ".flash",
    ".next",
    ".turbo",
    ".vercel",
    "node_modules",
    "coverage",
];

pub fn project_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    walk_files_filtered(root, SKIP_DIRS).map_err(|err| err.to_string())
}

pub fn source_directives(source: &str) -> (bool, bool) {
    let found = directives(source);
    (
        found.iter().any(|directive| directive == "use client"),
        found.iter().any(|directive| directive == "use server"),
    )
}

pub fn emit_bound_pipeline(cwd: &Path, phase: &str) -> Result<PathBuf, String> {
    let mut tasks = TaskGraph::new();
    tasks
        .add("scan", &[])
        .map_err(|err| err.to_string())?;
    tasks
        .add("classify", &["scan"])
        .map_err(|err| err.to_string())?;
    tasks
        .add("emit", &["classify"])
        .map_err(|err| err.to_string())?;
    let task_order = tasks.order().map_err(|err| err.to_string())?;

    let mut tracer = Tracer::new(phase);
    tracer.event("scan");
    let files = project_files(cwd)?;
    tracer.event("classify");

    let mut bundle = BundleGraph::new();
    let mut chunks = ChunkGraph::new();
    let mut runtime = RuntimeManifest::new();
    let mut css_modules = 0usize;
    let mut css_imports = 0usize;
    let mut json_modules = 0usize;
    let mut markdown_docs = 0usize;
    let mut images = 0usize;
    let mut wasm_modules = 0usize;
    let mut resolved = 0usize;
    let mut resolves_attempted = 0usize;
    let mut client_components = 0usize;
    let mut server_actions = 0usize;

    for path in &files {
        let relative = path
            .strip_prefix(cwd)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/");
        let kind = content_type(&relative);
        let _ = kind;
        let transform = transform_for_path(&relative);
        bundle.add_module(relative.clone());
        runtime.insert(relative.clone(), transform.name.clone());

        if relative.ends_with(".css") {
            if classify_css(&relative) == CssPipeline::Module {
                css_modules += 1;
            }
            if let Ok(source) = read_file(path) {
                css_imports += collect_imports(&source).len();
            }
        }

        if is_json_asset(&relative) {
            if let Ok(source) = read_file(path) {
                if json_module(&source).is_ok() {
                    json_modules += 1;
                }
            }
        }

        if supported_extensions().iter().any(|ext| relative.ends_with(&format!(".{ext}"))) {
            if let Ok(source) = read_file(path) {
                let compiled = compile_markdown(&source);
                let out = cwd
                    .join(".flash")
                    .join("pipeline")
                    .join("mdx")
                    .join(format!("{relative}.html"));
                write_file(&out, &compiled.html).map_err(|err| err.to_string())?;
                markdown_docs += 1;
            }
        }

        let ext = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        if matches!(ext, "png" | "gif" | "jpg" | "jpeg") {
            if let Ok(bytes) = fs::read(path) {
                if sniff_image(&bytes).is_some() {
                    images += 1;
                }
            }
        }
        if ext == "wasm" {
            if let Ok(bytes) = fs::read(path) {
                if inspect_wasm(&bytes).is_ok() {
                    wasm_modules += 1;
                }
            }
        }

        if matches!(ext, "js" | "jsx" | "ts" | "tsx" | "mjs" | "cjs") {
            if let Ok(source) = read_file(path) {
                let (client, server) = source_directives(&source);
                if client {
                    client_components += 1;
                }
                if server {
                    server_actions += 1;
                }
                let mut edges = specifiers(&source);
                if edges.is_empty() {
                    edges = import_specifiers(&source);
                }
                for spec in edges.into_iter().take(32) {
                    bundle.add_import(relative.clone(), spec.clone());
                    if resolves_attempted < 64 && (spec.starts_with("./") || spec.starts_with("../")) {
                        resolves_attempted += 1;
                        if resolve_module(cwd, Some(path.as_path()), &spec).is_ok() {
                            resolved += 1;
                        }
                    }
                }
                if relative.contains("page.") || relative.contains("layout.") || relative.ends_with("index.tsx") {
                    chunks.insert(relative.clone(), &[]);
                }
            }
        }
    }

    tracer.event("emit");
    let summary = tracer.summary();
    let records = vec![FlashTraceRecord {
        category: "pipeline".to_string(),
        detail: summary.phase.clone(),
    }];
    let grouped = group(&records);
    let formatted = format_record(&records[0]);
    let mut trace_log = TraceLog::new();
    trace_log.push(TraceRecord {
        label: formatted.clone(),
        phase: phase.to_string(),
    });
    let _phase_records = trace_log.by_phase(phase);

    let entry = chunks
        .get("app/page.tsx")
        .map(|chunk| chunk.id.clone())
        .or_else(|| runtime.chunk_ids().into_iter().next());
    let preloads = entry
        .as_deref()
        .map(|id| preload_list(&chunks, id))
        .unwrap_or_default();
    let module_sample = module_url(entry.as_deref().unwrap_or("app/page.tsx"));
    let hmr = FlashHmrMessage {
        route: "/".to_string(),
        event: "update".to_string(),
    };
    let env_pairs = read_env_files(cwd);
    let public_env = client_public(&env_pairs);
    let package_main = package_main_field(cwd);
    let launch = from_package_main(&package_main);
    let analyze = bundle.analyze_summary();
    let _cycles = bundle.cycles();

    let payload = json!({
        "schemaVersion": 1,
        "engine": "flashpack",
        "pipeline": "flashpack-cli",
        "phase": phase,
        "crates": [
            "flash-tasks",
            "flash-tasks-env",
            "flash-tasks-fs",
            "flashpack-analyze",
            "flashpack-browser",
            "flashpack-cli-utils",
            "flashpack-css",
            "flashpack-ecmascript",
            "flashpack-ecmascript-hmr-protocol",
            "flashpack-ecmascript-plugins",
            "flashpack-ecmascript-runtime",
            "flashpack-env",
            "flashpack-image",
            "flashpack-json",
            "flashpack-mdx",
            "flashpack-nft",
            "flashpack-nodejs",
            "flashpack-resolve",
            "flashpack-static",
            "flashpack-swc-utils",
            "flashpack-trace-server",
            "flashpack-trace-utils",
            "flashpack-tracing",
            "flashpack-wasm"
        ],
        "taskOrder": task_order,
        "plugins": plugin_count(),
        "wasmVersion": flashpack_wasm_version(),
        "hmr": hmr.to_json(),
        "moduleUrl": module_sample,
        "command": launch.command_line(),
        "analyze": analyze,
        "trace": formatted,
        "traceGroups": grouped.len(),
        "traceEvents": summary.event_count,
        "preloads": preloads,
        "publicEnv": public_env.len(),
        "stats": {
            "files": files.len(),
            "clientComponents": client_components,
            "serverActions": server_actions,
            "cssModules": css_modules,
            "cssImports": css_imports,
            "jsonModules": json_modules,
            "markdownDocs": markdown_docs,
            "images": images,
            "wasmModules": wasm_modules,
            "resolved": resolved
        }
    });

    let out = cwd.join(".flash").join("pipeline").join("bound.json");
    write_file(&out, &serde_json::to_string_pretty(&payload).map_err(|err| err.to_string())?)
        .map_err(|err| err.to_string())?;
    Ok(out)
}

fn read_env_files(cwd: &Path) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    for name in [".env", ".env.local", ".env.development"] {
        let path = cwd.join(name);
        if let Ok(text) = read_file(&path) {
            pairs = merge_env(pairs, parse_env_file(&text));
            let _ = parse_env(&text);
        }
    }
    pairs
}

fn merge_env(base: Vec<(String, String)>, extra: Vec<(String, String)>) -> Vec<(String, String)> {
    let mut merged = base;
    for (key, value) in extra {
        if let Some(existing) = merged.iter_mut().find(|(current, _)| current == &key) {
            existing.1 = value;
        } else {
            merged.push((key, value));
        }
    }
    merged
}

fn package_main_field(cwd: &Path) -> String {
    let Ok(text) = read_file(&cwd.join("package.json")) else {
        return "index.js".to_string();
    };
    serde_json::from_str::<Value>(&text)
        .ok()
        .and_then(|value| value.get("main").and_then(Value::as_str).map(str::to_string))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "index.js".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn emit_writes_the_crate_binding() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("flashpack-bind-{nanos}"));
        fs::create_dir_all(root.join("app")).unwrap();
        fs::write(
            root.join("app/page.tsx"),
            "\"use client\";\nimport './base.css';\nexport default function Page() { return null }\n",
        )
        .unwrap();
        fs::write(root.join("app/base.module.css"), ".a { color: red }\n").unwrap();
        fs::write(root.join("package.json"), "{\"main\":\"index.js\"}").unwrap();
        fs::write(root.join(".env"), "VISTA_PUBLIC_SITE=vista\n").unwrap();

        let bound = emit_bound_pipeline(&root, "dev").unwrap();
        let text = fs::read_to_string(&bound).unwrap();
        let value: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["pipeline"], "flashpack-cli");
        let crates = value["crates"].as_array().unwrap();
        assert!(crates.iter().any(|crate_name| crate_name == "flashpack-resolve"));
        assert!(crates.iter().any(|crate_name| crate_name == "flashpack-ecmascript"));
        assert!(value["stats"]["clientComponents"].as_u64().unwrap() >= 1);
        assert!(value["stats"]["cssModules"].as_u64().unwrap() >= 1);
        let _ = fs::remove_dir_all(root);
    }
}
