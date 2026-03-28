use vista_core::{VistaEngine, VistaWorkspaceConfig};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VistaProject {
    pub name: String,
    pub workspace: VistaWorkspaceConfig,
    pub engine: VistaEngine,
}

impl VistaProject {
    pub fn new(name: impl Into<String>, workspace: VistaWorkspaceConfig, engine: VistaEngine) -> Self {
        Self {
            name: name.into(),
            workspace,
            engine,
        }
    }
}
