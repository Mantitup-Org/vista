use serde::{Deserialize, Serialize};

use crate::VistaEngine;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VistaArtifactManifest {
    pub schema_version: u8,
    pub build_dir: String,
    pub engine: VistaEngine,
    pub routes: usize,
    pub server_actions: usize,
    pub client_modules: usize,
}

impl VistaArtifactManifest {
    pub fn new(
        engine: VistaEngine,
        routes: usize,
        server_actions: usize,
        client_modules: usize,
    ) -> Self {
        Self {
            schema_version: 1,
            build_dir: ".vista".to_string(),
            engine,
            routes,
            server_actions,
            client_modules,
        }
    }
}
