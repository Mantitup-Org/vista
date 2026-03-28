use std::path::{Path, PathBuf};

use vista_core::{
    candidate_bases_for_subpath, normalize_vista_request, VistaImportResolution,
};

fn resolve_existing_module_base(package_root: &Path, candidate_base: &str) -> Option<PathBuf> {
    let candidate_path = candidate_base
        .split('/')
        .fold(package_root.to_path_buf(), |acc, segment| acc.join(segment));
    let candidate_base_string = candidate_path.to_string_lossy().into_owned();

    for extension in ["js", "ts", "tsx", "jsx"] {
        let absolute_path = PathBuf::from(format!("{candidate_base_string}.{extension}"));
        if absolute_path.exists() {
            return Some(absolute_path);
        }
    }

    for extension in ["js", "ts", "tsx", "jsx"] {
        let index_path = candidate_path.join(format!("index.{extension}"));
        if index_path.exists() {
            return Some(index_path);
        }
    }

    None
}

pub fn resolve_vista_source_import(
    request: &str,
    package_root: impl AsRef<Path>,
) -> Option<VistaImportResolution> {
    let normalized_request = normalize_vista_request(request)?;
    let subpath = normalized_request
        .strip_prefix("vista/")
        .unwrap_or("")
        .to_string();
    let candidate_bases = candidate_bases_for_subpath(&subpath);
    let resolved_path = candidate_bases
        .iter()
        .find_map(|candidate_base| resolve_existing_module_base(package_root.as_ref(), candidate_base))
        .map(|resolved| resolved.to_string_lossy().into_owned());

    Some(VistaImportResolution {
        normalized_request,
        subpath,
        candidate_bases,
        resolved_path,
    })
}
