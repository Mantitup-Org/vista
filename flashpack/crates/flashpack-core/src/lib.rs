use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashpackOptions {
    pub project_root: String,
    pub mode: String,
}

impl Default for FlashpackOptions {
    fn default() -> Self {
        Self {
            project_root: ".".to_string(),
            mode: "development".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FlashpackStats {
    pub total_files: usize,
    pub source_files: usize,
    pub app_files: usize,
    pub component_files: usize,
    pub client_components: usize,
    pub server_actions: usize,
    pub route_modules: usize,
    pub parallel_slots: usize,
    pub interception_routes: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashpackFileEntry {
    pub relative_path: String,
    pub source_kind: String,
    pub bytes: u64,
    pub client_component: bool,
    pub server_action: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashpackRouteEntry {
    pub file: String,
    pub route: String,
    pub kind: String,
    pub slot: Option<String>,
    pub interception: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashpackProjectGraph {
    pub schema_version: u8,
    pub engine: String,
    pub pipeline_owner: String,
    pub phase: String,
    pub mode: String,
    pub generated_at_ms: u64,
    pub project_root: String,
    pub stats: FlashpackStats,
    pub files: Vec<FlashpackFileEntry>,
    pub routes: Vec<FlashpackRouteEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashpackRuntimeManifest {
    pub schema_version: u8,
    pub engine: String,
    pub pipeline_owner: String,
    pub command: String,
    pub phase: String,
    pub mode: String,
    pub generated_at_ms: u64,
    pub project_root: String,
    pub graph_relative_path: String,
    pub runner: Option<String>,
    pub node_command: Option<String>,
    pub port: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashpackLatestState {
    pub schema_version: u8,
    pub engine: String,
    pub pipeline_owner: String,
    pub command: String,
    pub phase: String,
    pub mode: String,
    pub generated_at_ms: u64,
    pub project_root: String,
    pub graph_path: String,
    pub runtime_manifest_path: String,
    pub runner: Option<String>,
}
