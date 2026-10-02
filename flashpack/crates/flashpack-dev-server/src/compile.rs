use crate::packages::{mod_url, shim_url};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;
use swc_core::common::comments::SingleThreadedComments;
use swc_core::common::sync::Lrc;
use swc_core::common::{FileName, Globals, Mark, SourceMap, GLOBALS};
use swc_core::ecma::ast::{EsVersion, Program};
use swc_core::ecma::codegen::text_writer::JsWriter;
use swc_core::ecma::codegen::{Config as CodegenConfig, Emitter};
use swc_core::ecma::parser::{parse_file_as_module, EsSyntax, Syntax, TsSyntax};
use swc_core::ecma::transforms::base::fixer::fixer;
use swc_core::ecma::transforms::base::helpers::{Helpers, HELPERS};
use swc_core::ecma::transforms::base::hygiene::hygiene;
use swc_core::ecma::transforms::base::resolver;
use swc_core::ecma::transforms::react::{jsx, Options as JsxOptions, Runtime};
use swc_core::ecma::transforms::typescript::strip;
const SOURCE_EXTENSIONS: &[&str] = &["tsx", "ts", "jsx", "js", "mjs"];

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct CompileCache {
    files: HashMap<String, CacheEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CacheEntry {
    mtime_ms: u128,
    size: u64,
}

#[derive(Debug, Clone)]
pub struct CompileReport {
    pub compiled: usize,
    pub cached: usize,
    pub errors: Vec<String>,
}

pub struct Compiler {
    cwd: PathBuf,
    out_dir: PathBuf,
    cache_path: PathBuf,
    cache: CompileCache,
}

impl Compiler {
    pub fn new(cwd: PathBuf) -> Self {
        let flash = cwd.join(".flash");
        let cache_path = flash.join("cache").join("swc-manifest.json");
        let cache = fs::read(&cache_path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        Self {
            cwd,
            out_dir: flash.join("dev").join("modules"),
            cache_path,
            cache,
        }
    }

    pub fn compile_dirty(&mut self) -> CompileReport {
        let mut report = CompileReport {
            compiled: 0,
            cached: 0,
            errors: Vec::new(),
        };
        let sources = list_sources(&self.cwd);
        let mut live = HashMap::new();

        for source in sources {
            let rel = match source.strip_prefix(&self.cwd) {
                Ok(rel) => rel.to_path_buf(),
                Err(_) => continue,
            };
            let key = rel.to_string_lossy().replace('\\', "/");
            let meta = match fs::metadata(&source) {
                Ok(meta) => meta,
                Err(error) => {
                    report.errors.push(format!("{key}: {error}"));
                    continue;
                }
            };
            let mtime_ms = meta
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|time| time.as_millis())
                .unwrap_or(0);
            let size = meta.len();
            live.insert(key.clone(), CacheEntry { mtime_ms, size });

            let output = module_output_path(&self.out_dir, &rel);
            let fresh = self.cache.files.get(&key).is_some_and(|entry| {
                entry.mtime_ms == mtime_ms && entry.size == size && output.exists()
            });
            if fresh {
                report.cached += 1;
                continue;
            }

            match compile_file(&self.cwd, &source, &rel, &output) {
                Ok(()) => report.compiled += 1,
                Err(error) => report.errors.push(format!("{key}: {error:#}")),
            }
        }

        self.cache.files = live;
        if let Some(parent) = self.cache_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(bytes) = serde_json::to_vec_pretty(&self.cache) {
            let _ = fs::write(&self.cache_path, bytes);
        }
        report
    }
}

fn compile_file(cwd: &Path, source: &Path, rel: &Path, output: &Path) -> Result<()> {
    let code = fs::read_to_string(source)
        .with_context(|| format!("read {}", source.display()))?;
    let cm: Lrc<SourceMap> = Default::default();
    let fm = cm.new_source_file(
        Lrc::new(FileName::Real(source.to_path_buf())),
        code,
    );
    let (typescript, jsx_enabled) = flashpack_swc_utils::parser_syntax(&source.to_string_lossy());
    let syntax = if typescript {
        Syntax::Typescript(TsSyntax {
            tsx: jsx_enabled,
            decorators: true,
            ..Default::default()
        })
    } else {
        Syntax::Es(EsSyntax {
            jsx: jsx_enabled,
            ..Default::default()
        })
    };

    let globals = Globals::new();
    let comments = SingleThreadedComments::default();

    let module = GLOBALS.set(&globals, || {
        let helpers = Helpers::new(false);
        HELPERS.set(&helpers, || {
            let mut recovered = Vec::new();
            let module = parse_file_as_module(
                &fm,
                syntax,
                EsVersion::Es2022,
                Some(&comments),
                &mut recovered,
            )
            .map_err(|error| anyhow::anyhow!("parse: {error:?}"))?;
            let unresolved = Mark::new();
            let top_level = Mark::new();
            let mut program = Program::Module(module);
            program.mutate(resolver(unresolved, top_level, true));
            program.mutate(strip(unresolved, top_level));
            program.mutate(jsx(
                cm.clone(),
                Some(comments.clone()),
                JsxOptions {
                    runtime: Some(Runtime::Automatic),
                    development: Some(true),
                    ..Default::default()
                },
                top_level,
                unresolved,
            ));
            let Program::Module(mut module) = program else {
                return Err(anyhow::anyhow!("expected a module after transforms"));
            };
            rewrite_module_specifiers(&mut module, cwd, rel);
            let mut program = Program::Module(module);
            program.mutate(hygiene());
            program.mutate(fixer(None));
            let Program::Module(module) = program else {
                return Err(anyhow::anyhow!("expected a module after hygiene"));
            };
            Ok::<_, anyhow::Error>(module)
        })
    })?;

    let mut buf = Vec::new();
    {
        let mut emitter = Emitter {
            cfg: CodegenConfig::default().with_target(EsVersion::Es2022),
            cm: cm.clone(),
            comments: None,
            wr: JsWriter::new(cm, "\n", &mut buf, None),
        };
        emitter
            .emit_module(&module)
            .context("emit module")?;
    }

    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(output, buf).with_context(|| format!("write {}", output.display()))?;
    Ok(())
}

fn rewrite_module_specifiers(module: &mut swc_core::ecma::ast::Module, cwd: &Path, rel: &Path) {
    use swc_core::ecma::ast::*;
    for item in &mut module.body {
        match item {
            ModuleItem::ModuleDecl(ModuleDecl::Import(import)) => {
                rewrite_str(cwd, rel, &mut import.src);
            }
            ModuleItem::ModuleDecl(ModuleDecl::ExportAll(export)) => {
                rewrite_str(cwd, rel, &mut export.src);
            }
            ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(export)) => {
                if let Some(src) = export.src.as_mut() {
                    rewrite_str(cwd, rel, src);
                }
            }
            _ => {}
        }
    }
}

fn rewrite_str(cwd: &Path, rel: &Path, src: &mut swc_core::ecma::ast::Str) {
    let current = src.value.as_str().unwrap_or("");
    let next = module_specifier_url(rel, current, cwd);
    if next != current {
        src.raw = None;
        src.value = next.into();
    }
}

pub fn module_specifier_url(from_rel: &Path, spec: &str, cwd: &Path) -> String {
    if spec.ends_with(".css") || spec.ends_with(".css'") {
        return "/_flashpack/empty.js".to_string();
    }
    if let Some(shim) = shim_url(spec) {
        return shim.to_string();
    }
    if let Some(rel) = project_source(cwd, spec) {
        return format!("/_flashpack/modules/{}", module_name(&rel));
    }
    if is_bare_specifier(spec) {
        return mod_url(spec);
    }
    if let Some(rest) = spec.strip_prefix("@/") {
        let resolved = resolve_source(cwd, Path::new(rest));
        return format!("/_flashpack/modules/{}", module_name(&resolved));
    }
    if spec.starts_with("./") || spec.starts_with("../") {
        let dir = from_rel.parent().unwrap_or(Path::new(""));
        let joined = normalize_path(&dir.join(spec));
        let resolved = resolve_source(cwd, &joined);
        return format!("/_flashpack/modules/{}", module_name(&resolved));
    }
    spec.to_string()
}

fn is_bare_specifier(spec: &str) -> bool {
    !spec.starts_with('.') && !spec.starts_with('/') && !spec.starts_with("@/")
}

fn project_source(cwd: &Path, spec: &str) -> Option<PathBuf> {
    if spec.starts_with('@') || spec.contains(':') || spec.contains('\\') {
        return None;
    }
    let candidates = source_candidates(Path::new(spec));
    candidates.into_iter().find(|candidate| cwd.join(candidate).is_file())
}

fn module_name(rel: &Path) -> String {
    // Always append `.js` so URLs match `module_output_path` for both
    // `page.tsx` → `page.tsx.js` and `page.js` → `page.js.js`.
    format!("{}.js", rel.to_string_lossy().replace('\\', "/"))
}

fn module_output_path(out_dir: &Path, rel: &Path) -> PathBuf {
    out_dir.join(format!("{}.js", rel.to_string_lossy().replace('\\', "/")))
}

fn resolve_source(cwd: &Path, rel: &Path) -> PathBuf {
    let candidates = source_candidates(rel);
    for candidate in &candidates {
        if cwd.join(candidate).is_file() {
            return candidate.clone();
        }
    }
    candidates.into_iter().next().unwrap_or_else(|| rel.to_path_buf())
}

fn source_candidates(rel: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let as_string = rel.to_string_lossy();
    let has_ext = SOURCE_EXTENSIONS
        .iter()
        .any(|ext| as_string.ends_with(&format!(".{ext}")));
    if has_ext {
        found.push(rel.to_path_buf());
        return found;
    }
    for ext in SOURCE_EXTENSIONS {
        found.push(rel.with_extension(ext));
    }
    for ext in SOURCE_EXTENSIONS {
        found.push(rel.join(format!("index.{ext}")));
    }
    found
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other),
        }
    }
    out
}

fn list_sources(cwd: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    walk(cwd, cwd, &mut files);
    files.sort();
    files
}

fn walk(cwd: &Path, dir: &Path, files: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if path.is_dir() {
            if matches!(
                name.as_ref(),
                ".git" | ".vista" | ".flash" | ".next" | ".turbo" | "node_modules" | "coverage" | "dist" | "target"
            ) {
                continue;
            }
            walk(cwd, &path, files);
            continue;
        }
        let ext = path.extension().and_then(|ext| ext.to_str()).unwrap_or("");
        if ext == "d.ts" || name.ends_with(".d.ts") {
            continue;
        }
        if SOURCE_EXTENSIONS.contains(&ext) {
            files.push(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alias_points_at_flashpack_module_url() {
        let url = module_specifier_url(Path::new("components/home.tsx"), "@/data/site", Path::new("."));
        assert!(url.starts_with("/_flashpack/modules/data/site"));
    }

    #[test]
    fn bare_imports_go_through_flashpack() {
        let url = module_specifier_url(Path::new("app/index.tsx"), "react/jsx-dev-runtime", Path::new("."));
        assert_eq!(url, "/_flashpack/mod/react/jsx-dev-runtime");
    }

    #[test]
    fn vista_runtime_imports_use_shims() {
        let url = module_specifier_url(Path::new("app/root.tsx"), "vista/link", Path::new("."));
        assert_eq!(url, "/_flashpack/shims/link.js");
    }

    #[test]
    fn css_imports_do_not_enter_the_module_graph() {
        let url = module_specifier_url(Path::new("app/root.tsx"), "./root.css", Path::new("."));
        assert_eq!(url, "/_flashpack/empty.js");
    }
}
