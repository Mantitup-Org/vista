use vista_core::VistaWorkspaceConfig;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StandaloneBundlePlan {
    pub build_dir: String,
    pub server_entry: String,
    pub client_manifest: String,
}

impl StandaloneBundlePlan {
    pub fn from_workspace(workspace: &VistaWorkspaceConfig) -> Self {
        Self {
            build_dir: workspace.build_dir.clone(),
            server_entry: format!("{}/standalone/server.js", workspace.build_dir),
            client_manifest: format!("{}/react-client-manifest.json", workspace.build_dir),
        }
    }
}
