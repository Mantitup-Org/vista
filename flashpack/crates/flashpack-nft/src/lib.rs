use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlashTraceEntry {
    pub from: String,
    pub to: String,
}

const MAX_TRACE_FILES: usize = 200;
const EXTENSIONS: [&str; 6] = [".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"];

pub fn specifiers(source: &str) -> Vec<String> {
    let chars: Vec<char> = source.chars().collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '/' && i + 1 < chars.len() && chars[i + 1] == '/' {
            i += 2;
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
            continue;
        }
        if chars[i] == '/' && i + 1 < chars.len() && chars[i + 1] == '*' {
            i += 2;
            while i + 1 < chars.len() && !(chars[i] == '*' && chars[i + 1] == '/') {
                i += 1;
            }
            i = (i + 2).min(chars.len());
            continue;
        }
        if chars[i] == '\'' || chars[i] == '"' || chars[i] == '`' {
            i = skip_string(&chars, i);
            continue;
        }
        if is_ident_start(chars[i]) && (i == 0 || !is_ident_char(chars[i - 1])) {
            let start = i;
            i += 1;
            while i < chars.len() && is_ident_char(chars[i]) {
                i += 1;
            }
            let word: String = chars[start..i].iter().collect();
            let after = skip_gap(&chars, i);
            if word == "from" {
                if let Some((spec, next)) = read_quoted(&chars, after) {
                    out.push(spec);
                    i = next;
                }
                continue;
            }
            if (word == "import" || word == "require") && after < chars.len() && chars[after] == '('
            {
                let quoted_at = skip_gap(&chars, after + 1);
                if let Some((spec, next)) = read_quoted(&chars, quoted_at) {
                    out.push(spec);
                    i = next;
                }
                continue;
            }
            continue;
        }
        i += 1;
    }
    out
}

pub fn trace_files(entry: &Path, root: &Path) -> Result<Vec<FlashTraceEntry>, String> {
    let root = root.canonicalize().map_err(|err| format!("root: {err}"))?;
    let entry_canon = entry
        .canonicalize()
        .map_err(|err| format!("entry: {err}"))?;
    if !entry_canon.starts_with(&root) {
        return Err("entry is outside root".into());
    }
    let mut visited = HashSet::new();
    let mut out = Vec::new();
    walk(entry, &root, &mut visited, &mut out)?;
    Ok(out)
}

fn walk(
    file: &Path,
    root: &Path,
    visited: &mut HashSet<PathBuf>,
    out: &mut Vec<FlashTraceEntry>,
) -> Result<(), String> {
    let canon = file
        .canonicalize()
        .map_err(|err| format!("read {}: {err}", file.display()))?;
    if !canon.starts_with(root) {
        return Ok(());
    }
    if visited.len() >= MAX_TRACE_FILES || !visited.insert(canon) {
        return Ok(());
    }
    let source =
        std::fs::read_to_string(file).map_err(|err| format!("read {}: {err}", file.display()))?;
    for spec in specifiers(&source) {
        if !(spec.starts_with("./") || spec.starts_with("../")) {
            continue;
        }
        let Some(resolved) = resolve_specifier(file, &spec) else {
            continue;
        };
        let Ok(resolved_canon) = resolved.canonicalize() else {
            continue;
        };
        if !resolved_canon.starts_with(root) {
            continue;
        }
        out.push(FlashTraceEntry {
            from: forward_display(file),
            to: forward_display(&resolved),
        });
        walk(&resolved, root, visited, out)?;
    }
    Ok(())
}

fn resolve_specifier(from_file: &Path, spec: &str) -> Option<PathBuf> {
    let parent = from_file.parent()?;
    let base = parent.join(spec);
    if base.is_file() {
        return Some(base);
    }
    EXTENSIONS
        .into_iter()
        .map(|ext| append_suffix(&base, ext))
        .find(|candidate| candidate.is_file())
}

fn append_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut os = path.as_os_str().to_os_string();
    os.push(suffix);
    PathBuf::from(os)
}

fn forward_display(path: &Path) -> String {
    let canon = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let text = canon.to_string_lossy().replace('\\', "/");
    text.strip_prefix("//?/").unwrap_or(&text).to_string()
}

fn is_ident_start(ch: char) -> bool {
    ch.is_ascii_alphabetic() || ch == '_' || ch == '$'
}

fn is_ident_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '_' || ch == '$'
}

fn skip_gap(chars: &[char], mut i: usize) -> usize {
    loop {
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        if i + 1 < chars.len() && chars[i] == '/' && chars[i + 1] == '/' {
            i += 2;
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
            continue;
        }
        if i + 1 < chars.len() && chars[i] == '/' && chars[i + 1] == '*' {
            i += 2;
            while i + 1 < chars.len() && !(chars[i] == '*' && chars[i + 1] == '/') {
                i += 1;
            }
            i = (i + 2).min(chars.len());
            continue;
        }
        return i;
    }
}

fn skip_string(chars: &[char], i: usize) -> usize {
    let quote = chars[i];
    let mut j = i + 1;
    while j < chars.len() {
        if chars[j] == '\\' {
            j = (j + 2).min(chars.len());
            continue;
        }
        if chars[j] == quote {
            return j + 1;
        }
        if quote != '`' && chars[j] == '\n' {
            return i + 1;
        }
        j += 1;
    }
    chars.len()
}

fn read_quoted(chars: &[char], i: usize) -> Option<(String, usize)> {
    if i >= chars.len() || (chars[i] != '\'' && chars[i] != '"') {
        return None;
    }
    let quote = chars[i];
    let mut j = i + 1;
    let mut spec = String::new();
    while j < chars.len() {
        let ch = chars[j];
        if ch == '\\' && j + 1 < chars.len() {
            spec.push(chars[j + 1]);
            j += 2;
            continue;
        }
        if ch == quote {
            return Some((spec, j + 1));
        }
        if ch == '\n' {
            return None;
        }
        spec.push(ch);
        j += 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempDir(PathBuf);

    impl TempDir {
        fn new(label: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "flashpack-nft-{label}-{}-{nanos}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn collects_import_export_and_require_specifiers() {
        let source = r#"
            import 'side-effect';
            import value from './mod.js';
            import value from './mod.js';
            export { y } from "lib";
            export * from "./star.js";
            const z = import('dyn');
            const w = require("cjs");
            require('cjs');
            // import x from 'commented';
            /* require('blocked') */
            const text = "from 'nope'";
            const fromage = 1;
            const xfrom = 2;
        "#;
        assert_eq!(
            specifiers(source),
            vec![
                "./mod.js".to_string(),
                "./mod.js".to_string(),
                "lib".to_string(),
                "./star.js".to_string(),
                "dyn".to_string(),
                "cjs".to_string(),
                "cjs".to_string(),
            ]
        );
    }

    #[test]
    fn traces_relative_files_and_stops_cycles() {
        let base = TempDir::new("trace");
        let root = base.path().join("root");
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("a.js"),
            "import x from './b';\nimport y from '../outside.js';\nimport z from 'react';\nimport w from './a.js';\n",
        )
        .unwrap();
        fs::write(
            root.join("b.js"),
            "export const n = 1;\nimport c from './c.mjs';\n",
        )
        .unwrap();
        fs::write(root.join("b.ts"), "export const other = 1;\n").unwrap();
        fs::write(root.join("c.mjs"), "export const c = 1;\n").unwrap();
        fs::write(base.path().join("outside.js"), "export const out = 1;\n").unwrap();

        let entries = trace_files(&root.join("a.js"), &root).unwrap();
        assert!(entries.iter().all(|entry| {
            !entry.from.contains('\\')
                && !entry.to.contains('\\')
                && !entry.from.contains("//?/")
                && !entry.to.contains("//?/")
        }));
        assert!(
            entries
                .iter()
                .any(|entry| entry.from.ends_with("/a.js") && entry.to.ends_with("/b.js")),
            "{entries:?}"
        );
        assert!(entries.iter().any(|entry| entry.to.ends_with("/c.mjs")));
        assert!(!entries
            .iter()
            .any(|entry| entry.to.ends_with("/b.ts") || entry.to.contains("outside.js")));
        assert!(entries
            .iter()
            .any(|entry| entry.from.ends_with("/a.js") && entry.to.ends_with("/a.js")));
        assert!(entries.len() < 10);
    }

    #[test]
    fn trace_fails_for_missing_or_outside_entries() {
        let base = TempDir::new("fail");
        let root = base.path().join("root");
        fs::create_dir_all(&root).unwrap();
        let outside = base.path().join("out.js");
        fs::write(&outside, "export const x = 1;\n").unwrap();
        assert!(trace_files(&root.join("missing.js"), &root).is_err());
        assert!(trace_files(&outside, &root).is_err());
        assert!(trace_files(&root.join("a.js"), &base.path().join("no-root")).is_err());
    }
}
