use vista_core::{VistaEngine, VistaRuntimeConfig};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BuildPipelinePlan {
    pub engine: VistaEngine,
    pub owner: &'static str,
    pub phases: Vec<&'static str>,
}

impl BuildPipelinePlan {
    pub fn from_config(config: &VistaRuntimeConfig) -> Self {
        let engine = config.engine_variant();
        let owner = if engine.is_rust_backed() {
            "rust-cli"
        } else {
            "node-runtime"
        };

        Self {
            engine,
            owner,
            phases: vec!["scan", "manifest", "emit", "start"],
        }
    }
}
