use std::path::{Path, PathBuf};

pub fn normalize(path: impl AsRef<Path>) -> PathBuf {
    path.as_ref().components().collect()
}
