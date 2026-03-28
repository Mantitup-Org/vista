use flashpack::FlashpackRuntimeManifest;
use vista_core::{VistaEngine, VistaWorkspaceConfig};

#[derive(Debug, Clone)]
pub struct BuildOutputSummary {
    pub engine: VistaEngine,
    pub build_dir: String,
    pub flash_dir: String,
    pub runtime_manifest: Option<FlashpackRuntimeManifest>,
}

impl BuildOutputSummary {
    pub fn new(engine: VistaEngine, workspace: &VistaWorkspaceConfig) -> Self {
        Self {
            engine,
            build_dir: workspace.build_dir.clone(),
            flash_dir: workspace.flash_dir.clone(),
            runtime_manifest: None,
        }
    }
}
