use std::path::{Path, PathBuf};

pub fn normalize(path: impl AsRef<Path>) -> PathBuf {
    path.as_ref().components().collect()
}

pub fn write_file(path: &Path, contents: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(path, contents)
}

pub fn read_file(path: &Path) -> std::io::Result<String> {
    std::fs::read_to_string(path)
}

pub fn walk_files(root: &Path) -> std::io::Result<Vec<PathBuf>> {
    walk_files_filtered(root, &["node_modules", ".git", ".flash", ".vista"])
}

pub fn walk_files_filtered(root: &Path, skip_dirs: &[&str]) -> std::io::Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    walk_dir(root, skip_dirs, &mut files)?;
    files.sort();
    Ok(files)
}

fn walk_dir(dir: &Path, skip_dirs: &[&str], files: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            if let Some(name) = path.file_name().and_then(|name| name.to_str()) {
                if skip_dirs.iter().any(|skip| *skip == name) {
                    continue;
                }
            }
            walk_dir(&path, skip_dirs, files)?;
        } else if file_type.is_file() {
            files.push(path);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            let seq = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "flash-tasks-fs-{}-{nanos}-{seq}",
                std::process::id()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn normalize_collects_components() {
        assert_eq!(
            normalize("src/main.ts"),
            PathBuf::from("src").join("main.ts")
        );
    }

    #[test]
    fn writes_reads_and_walks_files_in_sorted_order() {
        let dir = TempDir::new();
        let root = &dir.0;
        write_file(&root.join("sub").join("c.txt"), "c").unwrap();
        write_file(&root.join("b.txt"), "b").unwrap();
        write_file(&root.join("a.txt"), "a").unwrap();
        write_file(&root.join("node_modules").join("secret.js"), "skip").unwrap();
        write_file(&root.join(".git").join("config"), "skip").unwrap();
        write_file(&root.join(".flash").join("state"), "skip").unwrap();
        write_file(&root.join(".vista").join("cache"), "skip").unwrap();

        assert_eq!(read_file(&root.join("sub").join("c.txt")).unwrap(), "c");
        assert_eq!(
            walk_files(root).unwrap(),
            vec![
                root.join("a.txt"),
                root.join("b.txt"),
                root.join("sub").join("c.txt"),
            ]
        );
    }

    #[test]
    fn filtered_walk_skips_named_directories() {
        let dir = TempDir::new();
        let root = &dir.0;
        write_file(&root.join("keep.txt"), "yes").unwrap();
        write_file(&root.join("coverage").join("lcov.txt"), "no").unwrap();
        assert_eq!(
            walk_files_filtered(root, &["coverage"]).unwrap(),
            vec![root.join("keep.txt")]
        );
    }

    #[test]
    fn read_and_walk_report_missing_paths() {
        let dir = TempDir::new();
        let missing = dir.0.join("no-such-file.txt");
        assert!(read_file(&missing).is_err());
        assert!(walk_files(&dir.0.join("missing-dir")).is_err());
    }
}
