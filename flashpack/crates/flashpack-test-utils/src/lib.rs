use std::fs;
use std::io::{self, ErrorKind};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlashpackFixture {
    pub id: String,
    pub app_dir: String,
}

pub fn scratch_dir(id: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::env::temp_dir()
        .join("flashpack-tests")
        .join(format!("{id}-{nanos}"))
}

pub fn write_fixture(root: &Path, files: &[(&str, &str)]) -> io::Result<()> {
    for (relative, _) in files {
        if !is_safe_relative(relative) {
            return Err(io::Error::new(
                ErrorKind::InvalidInput,
                "fixture path must be relative and must not contain ..",
            ));
        }
    }

    for (relative, contents) in files {
        let path = root.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, contents)?;
    }
    Ok(())
}

pub fn remove_dir(path: &Path) {
    let _ = fs::remove_dir_all(path);
}

fn is_safe_relative(relative: &str) -> bool {
    if relative.is_empty() {
        return false;
    }
    let path = Path::new(relative);
    if path.is_absolute() {
        return false;
    }
    path.components().all(|component| match component {
        Component::Normal(part) => !part.is_empty() && part != "..",
        Component::CurDir => true,
        Component::ParentDir | Component::RootDir | Component::Prefix(_) => false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scratch_dir_uses_temp_and_id() {
        let path = scratch_dir("alpha");
        assert_eq!(
            path.parent(),
            Some(std::env::temp_dir().join("flashpack-tests").as_path())
        );
        let name = path.file_name().unwrap().to_string_lossy();
        assert!(name.starts_with("alpha-"));
        assert!(name["alpha-".len()..].chars().all(|ch| ch.is_ascii_digit()));
    }

    #[test]
    fn writes_nested_files_and_rejects_parent_segments() {
        let root = scratch_dir("write");
        write_fixture(&root, &[("a.txt", "hello"), ("nested/dir/b.txt", "world")]).unwrap();
        assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "hello");
        assert_eq!(
            fs::read_to_string(root.join("nested").join("dir").join("b.txt")).unwrap(),
            "world"
        );

        let outside = root.parent().unwrap().join("nope.txt");
        assert!(write_fixture(&root, &[("../nope.txt", "x")]).is_err());
        assert!(write_fixture(&root, &[("foo/../../nope.txt", "x")]).is_err());
        assert!(write_fixture(&root, &[("", "x")]).is_err());
        assert!(!outside.exists());

        let absolute = if cfg!(windows) {
            r"C:\Windows\Temp\flashpack-abs-should-not-write.txt"
        } else {
            "/tmp/flashpack-abs-should-not-write.txt"
        };
        assert!(write_fixture(&root, &[(absolute, "no")]).is_err());

        remove_dir(&root);
        assert!(!root.exists());
        remove_dir(&root);
    }
}
