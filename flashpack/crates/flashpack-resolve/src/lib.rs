use std::path::{Component, Path, PathBuf};

pub fn resolve_entry(project_root: &Path, request: &str) -> PathBuf {
    project_root.join(request)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedModule {
    pub path: PathBuf,
    pub kind: ModuleKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModuleKind {
    Source,
    Json,
    Css,
    Other,
}

const FILE_EXTENSIONS: &[&str] = &["tsx", "ts", "jsx", "js", "mjs", "cjs", "json", "css"];
const INDEX_FILES: &[&str] = &["index.tsx", "index.ts", "index.jsx", "index.js", "index.mjs"];

impl ResolvedModule {
    pub fn from_path(path: PathBuf) -> Self {
        let kind = module_kind(&path);
        Self { path, kind }
    }
}

pub fn module_kind(path: &Path) -> ModuleKind {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("tsx" | "ts" | "jsx" | "js" | "mjs" | "cjs") => ModuleKind::Source,
        Some("json") => ModuleKind::Json,
        Some("css") => ModuleKind::Css,
        _ => ModuleKind::Other,
    }
}

pub fn resolve_module(
    project_root: &Path,
    from: Option<&Path>,
    request: &str,
) -> Result<PathBuf, String> {
    if request.is_empty() {
        return Err("cannot resolve empty module request".to_string());
    }
    if is_relative_request(request) {
        let base = importer_dir(project_root, from);
        resolve_existing(project_root, &base.join(request), request)
    } else if is_absolute_request(request) {
        resolve_existing(project_root, Path::new(request), request)
    } else {
        resolve_bare(project_root, from, request)
    }
}

fn is_relative_request(request: &str) -> bool {
    request == "."
        || request == ".."
        || request.starts_with("./")
        || request.starts_with(".\\")
        || request.starts_with("../")
        || request.starts_with("..\\")
}

fn is_absolute_request(request: &str) -> bool {
    Path::new(request).is_absolute() || request.starts_with('/') || request.starts_with('\\')
}

fn importer_dir(project_root: &Path, from: Option<&Path>) -> PathBuf {
    let Some(from) = from else {
        return project_root.to_path_buf();
    };
    let from = if from.is_absolute() {
        from.to_path_buf()
    } else {
        project_root.join(from)
    };
    from.parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .map(Path::to_path_buf)
        .filter(|parent| lexically_within(project_root, parent))
        .unwrap_or_else(|| project_root.to_path_buf())
}

fn resolve_existing(project_root: &Path, candidate: &Path, request: &str) -> Result<PathBuf, String> {
    match resolve_checked(project_root, candidate, request)? {
        Some(found) => Ok(found),
        None => Err(format!("cannot resolve module '{request}'")),
    }
}

fn resolve_checked(
    project_root: &Path,
    candidate: &Path,
    request: &str,
) -> Result<Option<PathBuf>, String> {
    ensure_inside(project_root, candidate, request)?;
    match resolve_candidate(candidate) {
        Some(found) => {
            let found = lexical_normalize(&found);
            ensure_inside(project_root, &found, request)?;
            Ok(Some(found))
        }
        None => Ok(None),
    }
}

fn resolve_candidate(path: &Path) -> Option<PathBuf> {
    if path.is_file() {
        return Some(path.to_path_buf());
    }
    for ext in FILE_EXTENSIONS {
        let candidate = append_extension(path, ext);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    if path.is_dir() {
        for index in INDEX_FILES {
            let candidate = path.join(index);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn append_extension(path: &Path, ext: &str) -> PathBuf {
    let mut owned = path.as_os_str().to_os_string();
    owned.push(".");
    owned.push(ext);
    PathBuf::from(owned)
}

fn resolve_bare(project_root: &Path, from: Option<&Path>, request: &str) -> Result<PathBuf, String> {
    let (name, subpath) = split_bare(request)?;
    let start = importer_dir(project_root, from);
    for modules in node_module_dirs(project_root, &start) {
        let pkg_dir = modules.join(&name);
        if !pkg_dir.is_dir() {
            continue;
        }
        if let Some(resolved) = resolve_package(project_root, &pkg_dir, subpath.as_deref(), request)?
        {
            return Ok(resolved);
        }
        return Err(format!("cannot resolve module '{request}'"));
    }
    Err(format!("cannot resolve module '{request}'"))
}

fn resolve_package(
    project_root: &Path,
    pkg_dir: &Path,
    subpath: Option<&str>,
    request: &str,
) -> Result<Option<PathBuf>, String> {
    if let Some(subpath) = subpath {
        return resolve_checked(project_root, &pkg_dir.join(subpath), request);
    }

    let manifest = pkg_dir.join("package.json");
    if !manifest.is_file() {
        let index = pkg_dir.join("index.js");
        if index.is_file() {
            ensure_inside(project_root, &index, request)?;
            return Ok(Some(index));
        }
        return Ok(None);
    }

    let text = std::fs::read_to_string(&manifest)
        .map_err(|err| format!("failed to read {}: {err}", manifest.display()))?;
    let text = text.trim_start_matches('\u{feff}');
    let module_entry = extract_top_level_string(text, "module");
    let main_entry = extract_top_level_string(text, "main");

    let mut saw_explicit = false;
    for entry in [module_entry, main_entry].into_iter().flatten() {
        if entry.is_empty() {
            continue;
        }
        saw_explicit = true;
        if let Some(found) = resolve_checked(project_root, &pkg_dir.join(entry), request)? {
            return Ok(Some(found));
        }
    }
    // Node loads index.js when package.json has no truthy main. Skip that when
    // `exports` is present so we don't prefer a root index over an exports map.
    if !saw_explicit && !has_top_level_key(text, "exports") {
        for index in INDEX_FILES {
            let candidate = pkg_dir.join(index);
            if candidate.is_file() {
                ensure_inside(project_root, &candidate, request)?;
                return Ok(Some(lexical_normalize(&candidate)));
            }
        }
    }
    Ok(None)
}

fn split_bare(request: &str) -> Result<(String, Option<String>), String> {
    let parts: Vec<&str> = request
        .split(['/', '\\'])
        .filter(|part| !part.is_empty())
        .collect();
    let Some(first) = parts.first().copied() else {
        return Err(format!("cannot resolve module '{request}'"));
    };
    if first.starts_with('@') {
        let Some(second) = parts.get(1).copied() else {
            return Err(format!("invalid scoped package '{request}'"));
        };
        let name = format!("{first}/{second}");
        let subpath = join_parts(&parts[2..]);
        return Ok((name, subpath));
    }
    Ok((first.to_string(), join_parts(&parts[1..])))
}

fn join_parts(parts: &[&str]) -> Option<String> {
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("/"))
    }
}

fn node_module_dirs(project_root: &Path, start: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let mut current = start.to_path_buf();
    loop {
        dirs.push(current.join("node_modules"));
        if same_path(&current, project_root) {
            break;
        }
        match current.parent() {
            Some(parent) if lexically_within(project_root, parent) => {
                current = parent.to_path_buf();
            }
            _ => break,
        }
    }
    dirs
}

fn ensure_inside(project_root: &Path, candidate: &Path, request: &str) -> Result<(), String> {
    if !lexically_within(project_root, candidate) {
        return Err(format!(
            "module '{request}' escapes project root {}",
            project_root.display()
        ));
    }
    if project_root.exists() && candidate.exists() {
        if let (Ok(root), Ok(path)) = (project_root.canonicalize(), candidate.canonicalize()) {
            if !lexically_within(&root, &path) {
                return Err(format!(
                    "module '{request}' escapes project root {}",
                    project_root.display()
                ));
            }
        }
    }
    Ok(())
}

fn lexically_within(root: &Path, candidate: &Path) -> bool {
    let root_normal = lexical_normalize(root);
    let candidate_normal = lexical_normalize(candidate);
    let root_parts: Vec<_> = root_normal.components().collect();
    let candidate_parts: Vec<_> = candidate_normal.components().collect();
    candidate_parts.len() >= root_parts.len()
        && candidate_parts
            .iter()
            .zip(root_parts.iter())
            .all(|(candidate, root)| candidate == root)
}

fn same_path(left: &Path, right: &Path) -> bool {
    let left = lexical_normalize(left);
    let right = lexical_normalize(right);
    left.components().eq(right.components())
}

fn lexical_normalize(path: &Path) -> PathBuf {
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => match parts.last().copied() {
                Some(Component::Normal(_)) => {
                    parts.pop();
                }
                Some(Component::ParentDir) | None => parts.push(Component::ParentDir),
                _ => {}
            },
            other => parts.push(other),
        }
    }
    parts.into_iter().collect()
}

fn has_top_level_key(json: &str, key: &str) -> bool {
    let bytes = json.as_bytes();
    let mut index = 0;
    let mut depth = 0i32;
    while index < bytes.len() {
        match bytes[index] {
            b'"' => {
                let Some((value, next)) = parse_json_string(json, index) else {
                    return false;
                };
                let mut cursor = next;
                while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
                    cursor += 1;
                }
                if depth == 1 && cursor < bytes.len() && bytes[cursor] == b':' && value == key {
                    return true;
                }
                index = next;
            }
            b'{' | b'[' => {
                depth += 1;
                index += 1;
            }
            b'}' | b']' => {
                depth -= 1;
                index += 1;
            }
            _ => index += 1,
        }
    }
    false
}

/// Reads a top-level JSON object string field without a JSON parser.
fn extract_top_level_string(json: &str, key: &str) -> Option<String> {
    let bytes = json.as_bytes();
    let mut index = 0;
    let mut depth = 0i32;
    while index < bytes.len() {
        match bytes[index] {
            b'"' => {
                let (value, next) = parse_json_string(json, index)?;
                let mut cursor = next;
                while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
                    cursor += 1;
                }
                if depth == 1 && cursor < bytes.len() && bytes[cursor] == b':' && value == key {
                    cursor += 1;
                    while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
                        cursor += 1;
                    }
                    if cursor < bytes.len() && bytes[cursor] == b'"' {
                        return parse_json_string(json, cursor).map(|(found, _)| found);
                    }
                }
                index = next;
            }
            b'{' | b'[' => {
                depth += 1;
                index += 1;
            }
            b'}' | b']' => {
                depth -= 1;
                index += 1;
            }
            _ => index += 1,
        }
    }
    None
}

fn parse_json_string(source: &str, start: usize) -> Option<(String, usize)> {
    let bytes = source.as_bytes();
    if bytes.get(start) != Some(&b'"') {
        return None;
    }
    let mut index = start + 1;
    let mut out = String::new();
    while index < bytes.len() {
        match bytes[index] {
            b'\\' => {
                index += 1;
                if index >= bytes.len() {
                    return None;
                }
                match bytes[index] {
                    b'"' => out.push('"'),
                    b'\\' => out.push('\\'),
                    b'/' => out.push('/'),
                    b'n' => out.push('\n'),
                    b'r' => out.push('\r'),
                    b't' => out.push('\t'),
                    b'b' => out.push('\u{0008}'),
                    b'f' => out.push('\u{000c}'),
                    b'u' => {
                        let hex = source.get(index + 1..index + 5)?;
                        let code = u32::from_str_radix(hex, 16).ok()?;
                        out.push(char::from_u32(code).unwrap_or('\u{FFFD}'));
                        index += 4;
                    }
                    other => out.push(other as char),
                }
                index += 1;
            }
            b'"' => return Some((out, index + 1)),
            _ => {
                let ch = source[index..].chars().next()?;
                out.push(ch);
                index += ch.len_utf8();
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

    struct TempProject(PathBuf);

    impl TempProject {
        fn new() -> Self {
            let seq = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "flashpack-resolve-{}-{nanos}-{seq}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempProject {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn write(path: &Path, contents: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, contents).unwrap();
    }

    #[test]
    fn resolve_entry_joins_the_request() {
        let root = Path::new("/app");
        assert_eq!(
            resolve_entry(root, "src/main.tsx"),
            root.join("src/main.tsx")
        );
    }

    #[test]
    fn resolves_relative_files_extensions_and_index() {
        let project = TempProject::new();
        let root = project.path();
        let importer = root.join("src").join("app.tsx");
        write(&importer, "export {}");
        write(&root.join("src").join("exact.ts"), "exact");
        write(&root.join("src").join("button.tsx"), "tsx");
        write(&root.join("src").join("button.ts"), "ts");
        write(&root.join("src").join("widget").join("index.ts"), "index");
        write(&root.join("lib").join("util.ts"), "util");
        write(&root.join("styles.css"), "body{}");
        write(&root.join("data.json"), "{}");

        assert_eq!(
            resolve_module(root, Some(&importer), "./exact.ts").unwrap(),
            root.join("src").join("exact.ts")
        );
        assert_eq!(
            resolve_module(root, Some(&importer), "./button").unwrap(),
            root.join("src").join("button.tsx")
        );
        assert_eq!(
            resolve_module(root, Some(&importer), "./widget").unwrap(),
            root.join("src").join("widget").join("index.ts")
        );
        assert_eq!(
            resolve_module(root, Some(&importer), "../lib/util.ts").unwrap(),
            root.join("lib").join("util.ts")
        );
        assert_eq!(
            resolve_module(root, None, "./styles").unwrap(),
            root.join("styles.css")
        );
        let data = resolve_module(root, None, "./data").unwrap();
        assert_eq!(data, root.join("data.json"));
        assert_eq!(
            ResolvedModule::from_path(data),
            ResolvedModule {
                path: root.join("data.json"),
                kind: ModuleKind::Json,
            }
        );
    }

    #[test]
    fn module_kind_follows_the_extension() {
        assert_eq!(module_kind(Path::new("a.TSX")), ModuleKind::Source);
        assert_eq!(module_kind(Path::new("a.mjs")), ModuleKind::Source);
        assert_eq!(module_kind(Path::new("a.JSON")), ModuleKind::Json);
        assert_eq!(module_kind(Path::new("a.css")), ModuleKind::Css);
        assert_eq!(module_kind(Path::new("a.png")), ModuleKind::Other);
        assert_eq!(module_kind(Path::new("README")), ModuleKind::Other);
    }

    #[test]
    fn resolves_packages_from_the_nearest_node_modules() {
        let project = TempProject::new();
        let root = project.path();
        let importer = root.join("src").join("app.tsx");
        write(&importer, "");
        write(
            &root.join("node_modules").join("lib").join("index.js"),
            "root",
        );
        write(
            &root.join("src")
                .join("node_modules")
                .join("lib")
                .join("index.js"),
            "near",
        );
        write(
            &root.join("node_modules")
                .join("left-pad")
                .join("package.json"),
            r#"{"name":"left-pad","exports":{"module":"./wrong.js"},"main":"./main.js","module":"./entry"}"#,
        );
        write(
            &root.join("node_modules").join("left-pad").join("entry.tsx"),
            "entry",
        );
        write(
            &root.join("node_modules").join("left-pad").join("main.js"),
            "main",
        );
        write(
            &root.join("node_modules").join("only-main").join("package.json"),
            r#"{"main":"./dist/index.js"}"#,
        );
        write(
            &root.join("node_modules")
                .join("only-main")
                .join("dist")
                .join("index.js"),
            "main-only",
        );
        write(
            &root.join("node_modules").join("legacy").join("index.js"),
            "legacy",
        );
        write(
            &root.join("node_modules")
                .join("@vista")
                .join("pkg")
                .join("package.json"),
            r#"{"module":"./lib/run.js"}"#,
        );
        write(
            &root.join("node_modules")
                .join("@vista")
                .join("pkg")
                .join("lib")
                .join("run.js"),
            "scoped",
        );
        write(
            &root.join("node_modules")
                .join("@vista")
                .join("pkg")
                .join("util.js"),
            "sub",
        );

        assert_eq!(
            resolve_module(root, Some(&importer), "lib").unwrap(),
            root.join("src")
                .join("node_modules")
                .join("lib")
                .join("index.js")
        );
        assert_eq!(
            resolve_module(root, Some(&importer), "left-pad").unwrap(),
            root.join("node_modules").join("left-pad").join("entry.tsx")
        );
        assert_eq!(
            resolve_module(root, None, "only-main").unwrap(),
            root.join("node_modules")
                .join("only-main")
                .join("dist")
                .join("index.js")
        );
        assert_eq!(
            resolve_module(root, None, "legacy").unwrap(),
            root.join("node_modules").join("legacy").join("index.js")
        );
        assert_eq!(
            resolve_module(root, None, "@vista/pkg").unwrap(),
            root.join("node_modules")
                .join("@vista")
                .join("pkg")
                .join("lib")
                .join("run.js")
        );
        assert_eq!(
            resolve_module(root, None, "@vista/pkg/util").unwrap(),
            root.join("node_modules")
                .join("@vista")
                .join("pkg")
                .join("util.js")
        );
    }

    #[test]
    fn rejects_paths_that_leave_the_project() {
        let project = TempProject::new();
        let root = project.path();
        let importer = root.join("src").join("app.tsx");
        write(&importer, "");

        let relative = resolve_module(root, Some(&importer), "../../secret.ts").unwrap_err();
        assert!(
            relative.contains("escapes project root"),
            "{relative}"
        );

        let outside = std::env::temp_dir().join(format!(
            "flashpack-resolve-outside-{}-{}.ts",
            std::process::id(),
            TEMP_SEQ.fetch_add(1, Ordering::Relaxed)
        ));
        let absolute = resolve_module(root, None, outside.to_str().unwrap()).unwrap_err();
        assert!(absolute.contains("escapes project root"), "{absolute}");

        let dotted = root.join("..").join(format!(
            "not-created-{}-{}.ts",
            std::process::id(),
            TEMP_SEQ.fetch_add(1, Ordering::Relaxed)
        ));
        assert!(!dotted.exists());
        let escaped = resolve_module(root, None, dotted.to_str().unwrap()).unwrap_err();
        assert!(escaped.contains("escapes project root"), "{escaped}");

        let missing = resolve_module(root, Some(&importer), "./missing").unwrap_err();
        assert!(missing.contains("cannot resolve module"), "{missing}");

        let scoped = resolve_module(root, None, "@vista").unwrap_err();
        assert!(scoped.contains("invalid scoped package"), "{scoped}");

        let bare = resolve_module(root, None, "not-installed").unwrap_err();
        assert!(bare.contains("cannot resolve module"), "{bare}");
    }

    #[test]
    fn accepts_an_absolute_path_inside_the_project() {
        let project = TempProject::new();
        let root = project.path();
        let file = root.join("src").join("main.ts");
        write(&file, "main");
        let resolved = resolve_module(root, None, file.to_str().unwrap()).unwrap();
        assert_eq!(resolved, file);
        assert_eq!(module_kind(&resolved), ModuleKind::Source);
    }

    #[test]
    fn package_without_main_uses_index_and_explicit_main_cannot_escape() {
        let project = TempProject::new();
        let root = project.path();
        write(
            &root.join("node_modules").join("plain").join("package.json"),
            r#"{"name":"plain","version":"1.0.0"}"#,
        );
        write(
            &root.join("node_modules").join("plain").join("index.js"),
            "index",
        );
        write(&root.join("node_modules").join("plain.js"), "sibling");
        assert_eq!(
            resolve_module(root, None, "plain").unwrap(),
            root.join("node_modules").join("plain").join("index.js")
        );

        write(
            &root.join("node_modules").join("broken").join("package.json"),
            r#"{"main":"./missing.js"}"#,
        );
        write(
            &root.join("node_modules").join("broken").join("index.js"),
            "index",
        );
        let missing = resolve_module(root, None, "broken").unwrap_err();
        assert!(
            missing.contains("cannot resolve module"),
            "{missing}"
        );

        let secret_name = format!(
            "secret-{}-{}.js",
            std::process::id(),
            TEMP_SEQ.fetch_add(1, Ordering::Relaxed)
        );
        let outside = root.parent().unwrap().join(&secret_name);
        write(&outside, "nope");
        write(
            &root.join("node_modules").join("evil").join("package.json"),
            &format!(r#"{{"main":"../../../{secret_name}"}}"#),
        );
        write(
            &root.join("node_modules").join("evil").join("index.js"),
            "index",
        );
        let escaped = resolve_module(root, None, "evil").unwrap_err();
        assert!(escaped.contains("escapes project root"), "{escaped}");
        let _ = fs::remove_file(&outside);
    }
}
