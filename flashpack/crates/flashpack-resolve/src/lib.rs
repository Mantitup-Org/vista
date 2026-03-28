use std::path::{Path, PathBuf};

pub fn resolve_entry(project_root: &Path, request: &str) -> PathBuf {
    project_root.join(request)
}
