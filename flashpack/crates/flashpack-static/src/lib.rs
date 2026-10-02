#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlashStaticAsset {
    pub logical_path: String,
    pub emitted_path: String,
}

pub fn content_type(path: &str) -> &'static str {
    let name = path.rsplit(['/', '\\']).next().unwrap_or(path);
    let Some((stem, ext)) = name.rsplit_once('.') else {
        return "application/octet-stream";
    };
    if stem.is_empty() || ext.is_empty() {
        return "application/octet-stream";
    }
    match ext.to_ascii_lowercase().as_str() {
        "js" | "mjs" => "text/javascript",
        "css" => "text/css",
        "html" => "text/html",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "woff2" => "font/woff2",
        "md" => "text/markdown",
        "txt" => "text/plain",
        _ => "application/octet-stream",
    }
}

pub fn resolve_public(
    public_root: &std::path::Path,
    request_path: &str,
) -> Option<FlashStaticAsset> {
    if request_path.contains('\\') || request_path.contains('\0') {
        return None;
    }
    let relative = request_path.trim_start_matches('/');
    if relative.is_empty() {
        return None;
    }
    let mut segments = Vec::new();
    for segment in relative.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            return None;
        }
        segments.push(segment);
    }
    if segments.is_empty() {
        return None;
    }
    let mut relative_path = std::path::PathBuf::new();
    for segment in &segments {
        relative_path.push(segment);
    }
    let full = public_root.join(&relative_path);
    if !full.is_file() {
        return None;
    }
    let joined = segments.join("/");
    let logical_path = if request_path.starts_with('/') {
        format!("/{joined}")
    } else {
        joined
    };
    Some(FlashStaticAsset {
        logical_path,
        emitted_path: full.display().to_string().replace('\\', "/"),
    })
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
                "flashpack-static-{label}-{}-{nanos}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn path(&self) -> &std::path::Path {
            &self.0
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn maps_known_extensions_and_defaults_the_rest() {
        assert_eq!(content_type("app.js"), "text/javascript");
        assert_eq!(content_type("dir/app.MJS"), "text/javascript");
        assert_eq!(content_type("app.css"), "text/css");
        assert_eq!(content_type("index.html"), "text/html");
        assert_eq!(content_type("data.json"), "application/json");
        assert_eq!(content_type("icon.svg"), "image/svg+xml");
        assert_eq!(content_type("a.png"), "image/png");
        assert_eq!(content_type("a.JPG"), "image/jpeg");
        assert_eq!(content_type("a.jpeg"), "image/jpeg");
        assert_eq!(content_type("a.webp"), "image/webp");
        assert_eq!(content_type("font.woff2"), "font/woff2");
        assert_eq!(content_type("doc.md"), "text/markdown");
        assert_eq!(content_type("notes.txt"), "text/plain");
        assert_eq!(content_type("blob.bin"), "application/octet-stream");
        assert_eq!(content_type("noext"), "application/octet-stream");
    }

    #[test]
    fn resolves_files_inside_public_root() {
        let root = TempDir::new("ok");
        fs::create_dir_all(root.path().join("sub")).unwrap();
        fs::write(root.path().join("sub").join("a.txt"), "hi").unwrap();
        fs::create_dir_all(root.path().join("dir")).unwrap();

        let asset = resolve_public(root.path(), "/sub/./a.txt").unwrap();
        assert_eq!(asset.logical_path, "/sub/a.txt");
        assert!(asset.emitted_path.ends_with("/sub/a.txt"));
        assert!(!asset.emitted_path.contains('\\'));

        let relative = resolve_public(root.path(), "sub/a.txt").unwrap();
        assert_eq!(relative.logical_path, "sub/a.txt");
        assert_eq!(relative.emitted_path, asset.emitted_path);
    }

    #[test]
    fn rejects_traversal_and_missing_paths() {
        let root = TempDir::new("bad");
        fs::create_dir_all(root.path().join("sub")).unwrap();
        fs::write(root.path().join("sub").join("a.txt"), "hi").unwrap();
        fs::create_dir_all(root.path().join("dir")).unwrap();

        assert!(resolve_public(root.path(), "").is_none());
        assert!(resolve_public(root.path(), "/").is_none());
        assert!(resolve_public(root.path(), ".").is_none());
        assert!(resolve_public(root.path(), "..").is_none());
        assert!(resolve_public(root.path(), "/../a.txt").is_none());
        assert!(resolve_public(root.path(), "sub/../../a.txt").is_none());
        assert!(resolve_public(root.path(), r"sub\a.txt").is_none());
        assert!(resolve_public(root.path(), "/missing.txt").is_none());
        assert!(resolve_public(root.path(), "/dir").is_none());
    }
}
