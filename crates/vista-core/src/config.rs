use serde::{Deserialize, Serialize};

use crate::{TargetPlatform, VistaEngine};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VistaRuntimeConfig {
    pub engine: String,
}

impl VistaRuntimeConfig {
    pub fn engine_variant(&self) -> VistaEngine {
        VistaEngine::from_str(&self.engine)
    }
}

impl Default for VistaRuntimeConfig {
    fn default() -> Self {
        Self {
            engine: VistaEngine::default().as_str().to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VistaWorkspaceConfig {
    pub root_dir: String,
    pub build_dir: String,
    pub flash_dir: String,
}

impl Default for VistaWorkspaceConfig {
    fn default() -> Self {
        Self {
            root_dir: ".".to_string(),
            build_dir: ".vista".to_string(),
            flash_dir: ".flash".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VistaExecutionTarget {
    pub platform: TargetPlatform,
    pub engine: VistaEngine,
}

impl VistaExecutionTarget {
    pub fn for_current_platform(config: &VistaRuntimeConfig) -> Self {
        Self {
            platform: TargetPlatform::current(),
            engine: config.engine_variant(),
        }
    }
}
