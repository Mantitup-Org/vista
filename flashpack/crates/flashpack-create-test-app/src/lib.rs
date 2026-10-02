use std::fs;
use std::io::{self, ErrorKind};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlashpackTestAppRecipe {
    pub name: String,
    pub template: String,
}

pub fn materialize(root: &Path, recipe: &FlashpackTestAppRecipe) -> io::Result<PathBuf> {
    if recipe_name_rejected(&recipe.name) {
        return Err(io::Error::new(
            ErrorKind::InvalidInput,
            "recipe name must not contain quotes or path separators",
        ));
    }

    fs::create_dir_all(root)?;
    let package_json = format!(
        "{{\"name\":\"{}\",\"private\":true}}",
        escape_json(&recipe.name)
    );
    fs::write(root.join("package.json"), package_json)?;

    let app_dir = root.join("app");
    fs::create_dir_all(&app_dir)?;
    fs::write(
        app_dir.join("page.tsx"),
        page_source(&recipe.name, &recipe.template),
    )?;
    fs::write(app_dir.join("layout.tsx"), layout_source())?;
    Ok(root.to_path_buf())
}

fn recipe_name_rejected(name: &str) -> bool {
    name.contains('"') || name.contains('/') || name.contains('\\')
}

fn escape_json(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                escaped.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => escaped.push(c),
        }
    }
    escaped
}

fn escape_text_node(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '{' => escaped.push_str("&#123;"),
            '}' => escaped.push_str("&#125;"),
            c => escaped.push(c),
        }
    }
    escaped
}

fn page_source(name: &str, template: &str) -> String {
    format!(
        "export default function Page() {{\n  return <h1>{} {}</h1>;\n}}\n",
        escape_text_node(name),
        escape_text_node(template)
    )
}

fn layout_source() -> String {
    "export default function Layout({ children }: { children: unknown }) {\n  return (\n    <html>\n      <body>{children}</body>\n    </html>\n  );\n}\n".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root(id: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("flashpack-create-{id}-{nanos}"))
    }

    #[test]
    fn materialize_writes_package_page_and_layout() {
        let root = temp_root("ok");
        let recipe = FlashpackTestAppRecipe {
            name: "demo".to_string(),
            template: "starter".to_string(),
        };
        let returned = materialize(&root, &recipe).unwrap();
        assert_eq!(returned, root);
        assert_eq!(
            fs::read_to_string(root.join("package.json")).unwrap(),
            r#"{"name":"demo","private":true}"#
        );
        let page = fs::read_to_string(root.join("app").join("page.tsx")).unwrap();
        assert!(page.contains("export default function Page()"));
        assert!(page.contains("<h1>demo starter</h1>"));
        let layout = fs::read_to_string(root.join("app").join("layout.tsx")).unwrap();
        assert!(layout.contains("function Layout"));
        assert!(layout.contains("{children}"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn escapes_text_nodes_and_rejects_unsafe_names() {
        let root = temp_root("escape");
        let recipe = FlashpackTestAppRecipe {
            name: "x<y".to_string(),
            template: "a<b{c}".to_string(),
        };
        materialize(&root, &recipe).unwrap();
        let page = fs::read_to_string(root.join("app").join("page.tsx")).unwrap();
        assert!(page.contains("x&lt;y"));
        assert!(page.contains("a&lt;b&#123;c&#125;"));
        assert!(!page.contains("x<y"));
        assert!(!page.contains("a<b"));
        assert_eq!(
            fs::read_to_string(root.join("package.json")).unwrap(),
            r#"{"name":"x<y","private":true}"#
        );
        let _ = fs::remove_dir_all(&root);

        for name in ["a\"b", "a/b", "a\\b"] {
            let bad = FlashpackTestAppRecipe {
                name: name.to_string(),
                template: "starter".to_string(),
            };
            assert!(materialize(&temp_root("bad"), &bad).is_err());
        }
    }
}
