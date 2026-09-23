use vista_core::VistaWorkspaceConfig;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StandaloneBundlePlan {
    pub build_dir: String,
    pub server_entry: String,
    pub client_manifest: String,
}

impl StandaloneBundlePlan {
    pub fn from_workspace(workspace: &VistaWorkspaceConfig) -> Self {
        // `workspace.build_dir` already points to the directory that contains the
        // standalone artifacts (e.g., `.vista/standalone`). Previously we
        // appended an extra `standalone/` segment, resulting in an incorrect
        // path like `.vista/standalone/standalone/server.js`. This broke the
        // deployment packager which could not locate the server entry point.
        // The fix removes the redundant segment so the path resolves to the
        // actual `server.js` file.
        Self {
            build_dir: workspace.build_dir.clone(),
            server_entry: format!("{}/server.js", workspace.build_dir),
            client_manifest: format!("{}/react-client-manifest.json", workspace.build_dir),
        }
    }
}
