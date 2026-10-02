use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModuleKind {
    Esm,
    Cjs,
    Css,
    Json,
}

#[derive(Debug, Clone)]
pub struct ResolvedModule {
    pub path: PathBuf,
    pub kind: ModuleKind,
}

pub fn workspace_root(cwd: &Path) -> PathBuf {
    let mut current = cwd.to_path_buf();
    loop {
        if current.join("pnpm-workspace.yaml").is_file() || current.join(".git").exists() {
            return current;
        }
        if !current.pop() {
            return cwd.to_path_buf();
        }
    }
}

pub fn path_is_inside(path: &Path, root: &Path) -> bool {
    let Ok(path) = path.canonicalize() else {
        return false;
    };
    let Ok(root) = root.canonicalize() else {
        return false;
    };
    path.starts_with(root)
}

pub fn display_path(path: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    text.trim_start_matches("//?/").to_string()
}

pub fn encode_abs(path: &Path) -> String {
    percent_encode(&display_path(path))
}

pub fn decode_abs(encoded: &str) -> PathBuf {
    PathBuf::from(percent_decode(encoded))
}

pub fn mod_url(spec: &str) -> String {
    format!("/_flashpack/mod/{spec}")
}

pub fn file_url(path: &Path) -> String {
    format!("/_flashpack/file/{}", encode_abs(path))
}

pub fn raw_url(path: &Path) -> String {
    format!("/_flashpack/raw/{}", encode_abs(path))
}

pub fn shim_url(spec: &str) -> Option<&'static str> {
    match spec {
        "fs" | "node:fs" => Some("/_flashpack/shims/fs.js"),
        "vista/font/google" => Some("/_flashpack/shims/font-google.js"),
        "vista/metadata" => Some("/_flashpack/shims/metadata.js"),
        "vista/theme" => Some("/_flashpack/shims/theme.js"),
        "vista/link" => Some("/_flashpack/shims/link.js"),
        "vista/image" => Some("/_flashpack/shims/image.js"),
        "vista/navigation" => Some("/_flashpack/shims/navigation.js"),
        _ => None,
    }
}

pub fn resolve_request(cwd: &Path, from: Option<&Path>, spec: &str) -> Result<ResolvedModule, String> {
    if spec.starts_with("./") || spec.starts_with("../") {
        let base = from
            .and_then(|path| path.parent())
            .ok_or_else(|| format!("relative import {spec} has no parent"))?;
        let joined = normalize_path(&base.join(spec));
        return finalize(cwd, &joined);
    }

    let (package, subpath) = split_package(spec);
    let package_dir = find_package_dir(from.unwrap_or(cwd), package)
        .ok_or_else(|| format!("package not found: {package}"))?;
    let entry = resolve_package_entry(&package_dir, subpath)?;
    finalize(cwd, &entry)
}

pub fn rewrite_esm(source: &str, file: &Path, cwd: &Path) -> String {
    let mut output = String::with_capacity(source.len() + 32);
    let chars: Vec<char> = source.chars().collect();
    let mut index = 0;
    while index < chars.len() {
        if let Some(spec_at) = specifier_at(&chars, index) {
            let spec: String = chars[spec_at.start..spec_at.end].iter().collect();
            let replacement = match resolve_request(cwd, Some(file), &spec) {
                Ok(resolved) => match resolved.kind {
                    ModuleKind::Cjs => mod_url(&spec),
                    ModuleKind::Css | ModuleKind::Json | ModuleKind::Esm => file_url(&resolved.path),
                },
                Err(_) => spec,
            };
            for ch in &chars[index..spec_at.start - 1] {
                output.push(*ch);
            }
            output.push(spec_at.quote);
            output.push_str(&replacement);
            output.push(spec_at.quote);
            index = spec_at.end + 1;
            continue;
        }
        output.push(chars[index]);
        index += 1;
    }
    output
}

pub fn cjs_export_names(cwd: &Path, spec: &str) -> Vec<String> {
    let script = "const m=require(process.argv[1]); const keys=Object.keys(m).filter((key)=>key!=='__esModule'&&key!=='default'&&/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)); process.stdout.write(keys.join('\\n'));";
    let output = Command::new("node")
        .arg("-e")
        .arg(script)
        .arg(spec)
        .current_dir(cwd)
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect()
}

struct Specifier {
    start: usize,
    end: usize,
    quote: char,
}

fn specifier_at(chars: &[char], index: usize) -> Option<Specifier> {
    let rest: String = chars[index..].iter().take(24).collect();
    let quote_offset = if rest.starts_with("from ") || rest.starts_with("import ") || rest.starts_with("import(") {
        let after = if rest.starts_with("import(") { 7 } else if rest.starts_with("from ") { 5 } else { 7 };
        let mut cursor = index + after;
        while cursor < chars.len() && chars[cursor].is_whitespace() {
            cursor += 1;
        }
        if cursor < chars.len() && (chars[cursor] == '\'' || chars[cursor] == '"') {
            Some(cursor)
        } else {
            None
        }
    } else {
        None
    }?;
    let quote = chars[quote_offset];
    let start = quote_offset + 1;
    let end = chars[start..].iter().position(|ch| *ch == quote)? + start;
    Some(Specifier { start, end, quote })
}

fn finalize(cwd: &Path, path: &Path) -> Result<ResolvedModule, String> {
    let found = existing_file(path).ok_or_else(|| format!("file not found: {}", path.display()))?;
    let found = found
        .canonicalize()
        .unwrap_or(found);
    let found = PathBuf::from(display_path(&found));
    if !path_is_inside(&found, &workspace_root(cwd)) {
        return Err(format!("refusing to read {}", found.display()));
    }
    let kind = classify(&found);
    Ok(ResolvedModule { path: found, kind })
}

fn existing_file(path: &Path) -> Option<PathBuf> {
    if path.is_file() {
        return Some(path.to_path_buf());
    }
    let extensions = ["js", "mjs", "cjs", "json", "css"];
    for extension in extensions {
        let candidate = path.with_extension(extension);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    for extension in extensions {
        let candidate = path.join(format!("index.{extension}"));
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn classify(path: &Path) -> ModuleKind {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some("mjs") | Some("mts") => return ModuleKind::Esm,
        Some("cjs") => return ModuleKind::Cjs,
        Some("json") => return ModuleKind::Json,
        Some("css") => return ModuleKind::Css,
        _ => {}
    }
    let source = fs::read_to_string(path).unwrap_or_default();
    let head: String = source.chars().take(4000).collect();
    if head.contains("\nimport ")
        || head.contains("\nexport ")
        || head.starts_with("import ")
        || head.starts_with("export ")
        || head.contains("export{")
        || head.contains("export *")
    {
        ModuleKind::Esm
    } else {
        ModuleKind::Cjs
    }
}

fn resolve_package_entry(package_dir: &Path, subpath: &str) -> Result<PathBuf, String> {
    let manifest_path = package_dir.join("package.json");
    let manifest: Value = fs::read_to_string(&manifest_path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .ok_or_else(|| format!("missing package.json in {}", package_dir.display()))?;
    let key = if subpath.is_empty() {
        ".".to_string()
    } else {
        format!("./{subpath}")
    };
    if let Some(target) = manifest.get("exports").and_then(|exports| pick_export(exports, &key)) {
        return Ok(package_dir.join(target.trim_start_matches("./")));
    }
    if subpath.is_empty() {
        let fallback = manifest
            .get("module")
            .and_then(Value::as_str)
            .or_else(|| manifest.get("main").and_then(Value::as_str))
            .unwrap_or("index.js");
        return Ok(package_dir.join(fallback));
    }
    Ok(package_dir.join(subpath))
}

fn pick_export(exports: &Value, key: &str) -> Option<String> {
    match exports {
        Value::String(value) if key == "." => Some(value.clone()),
        Value::Object(map) => {
            if map.keys().any(|item| item.starts_with('.')) {
                return map.get(key).and_then(|value| pick_condition(value));
            }
            pick_condition(exports)
        }
        _ => None,
    }
}

fn pick_condition(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Array(items) => items.iter().find_map(pick_condition),
        Value::Object(map) => {
            for condition in ["import", "browser", "module", "development", "default"] {
                if let Some(next) = map.get(condition).and_then(pick_condition) {
                    return Some(next);
                }
            }
            None
        }
        _ => None,
    }
}

fn find_package_dir(start: &Path, package: &str) -> Option<PathBuf> {
    let mut current = if start.is_dir() {
        start.to_path_buf()
    } else {
        start.parent()?.to_path_buf()
    };
    if let Ok(real) = current.canonicalize() {
        current = real;
    }
    loop {
        let candidate = current.join("node_modules").join(package);
        if candidate.join("package.json").is_file() {
            return Some(candidate);
        }
        if !current.pop() {
            return None;
        }
    }
}

fn split_package(spec: &str) -> (&str, &str) {
    if let Some(rest) = spec.strip_prefix('@') {
        if let Some((name, sub)) = rest.split_once('/') {
            if let Some((nested, _subpath)) = sub.split_once('/') {
                let package_end = 1 + name.len() + 1 + nested.len();
                return (&spec[..package_end], &spec[package_end + 1..]);
            }
            return (spec, "");
        }
        return (spec, "");
    }
    if let Some((name, sub)) = spec.split_once('/') {
        return (name, sub);
    }
    (spec, "")
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

fn percent_encode(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap_or(""), 16) {
                out.push(byte);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_scoped_packages() {
        assert_eq!(
            split_package("@designcodeio/threeui/components/StructureFlowCollection"),
            ("@designcodeio/threeui", "components/StructureFlowCollection")
        );
        assert_eq!(split_package("react/jsx-dev-runtime"), ("react", "jsx-dev-runtime"));
    }
}
