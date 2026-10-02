#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlashSwcTransform {
    pub name: String,
    pub source_kind: String,
}

pub fn transform_for_path(path: &str) -> FlashSwcTransform {
    let ext = file_extension(path);
    let name = match ext.as_str() {
        "tsx" => "typescript-jsx",
        "ts" => "typescript",
        "jsx" => "jsx",
        "js" | "mjs" | "cjs" => "javascript",
        _ => "unknown",
    };
    let source_kind = if name == "unknown" {
        "unknown".to_string()
    } else {
        ext
    };
    FlashSwcTransform {
        name: name.to_string(),
        source_kind,
    }
}

pub fn parser_syntax(path: &str) -> (bool, bool) {
    match file_extension(path).as_str() {
        "ts" => (true, false),
        "tsx" => (true, true),
        "jsx" => (false, true),
        _ => (false, false),
    }
}

fn file_extension(path: &str) -> String {
    let name = path.rsplit(['/', '\\']).next().unwrap_or(path);
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() && !ext.is_empty() => ext.to_ascii_lowercase(),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transform_and_syntax_follow_extension() {
        assert_eq!(
            transform_for_path("components/Button.tsx"),
            FlashSwcTransform {
                name: "typescript-jsx".to_string(),
                source_kind: "tsx".to_string(),
            }
        );
        assert_eq!(parser_syntax("components/Button.tsx"), (true, true));

        assert_eq!(
            transform_for_path("lib\\mod.ts"),
            FlashSwcTransform {
                name: "typescript".to_string(),
                source_kind: "ts".to_string(),
            }
        );
        assert_eq!(parser_syntax("lib\\mod.ts"), (true, false));
        assert_eq!(parser_syntax("types/file.d.ts"), (true, false));

        assert_eq!(
            transform_for_path("page.JSX"),
            FlashSwcTransform {
                name: "jsx".to_string(),
                source_kind: "jsx".to_string(),
            }
        );
        assert_eq!(parser_syntax("page.JSX"), (false, true));

        for path in ["plain.js", "index.mjs", "app.cjs"] {
            let transform = transform_for_path(path);
            assert_eq!(transform.name, "javascript");
            assert_eq!(parser_syntax(path), (false, false));
        }
        assert_eq!(transform_for_path("dir.tsx/file.js").source_kind, "js");
    }

    #[test]
    fn unknown_paths_are_not_javascript() {
        for path in ["readme.md", "Makefile", "file.", ".tsx", "file.mts", ""] {
            assert_eq!(
                transform_for_path(path),
                FlashSwcTransform {
                    name: "unknown".to_string(),
                    source_kind: "unknown".to_string(),
                }
            );
            assert_eq!(parser_syntax(path), (false, false));
        }
    }
}
