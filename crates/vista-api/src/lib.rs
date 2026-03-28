mod analyze;
mod app;
mod entrypoints;
mod import_map;
mod module_graph;
mod project;
mod route;
mod server_actions;

pub use analyze::*;
pub use app::*;
pub use entrypoints::*;
pub use import_map::*;
pub use module_graph::*;
pub use project::*;
pub use route::*;
pub use server_actions::*;
pub use vista_core::{
    TargetPlatform, VistaArtifactManifest, VistaEngine, VistaRouteDefinition, VistaRouteKind,
    VistaRuntimeConfig, VistaWorkspaceConfig,
};

pub fn api_name() -> &'static str {
    "vista-api"
}
