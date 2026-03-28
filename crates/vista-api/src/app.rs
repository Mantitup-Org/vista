use vista_core::{VistaArtifactManifest, VistaEngine, VistaRouteDefinition};

#[derive(Debug, Clone)]
pub struct VistaAppDefinition {
    pub name: String,
    pub routes: Vec<VistaRouteDefinition>,
    pub manifest: VistaArtifactManifest,
}

impl VistaAppDefinition {
    pub fn new(
        name: impl Into<String>,
        engine: VistaEngine,
        routes: Vec<VistaRouteDefinition>,
        server_actions: usize,
        client_modules: usize,
    ) -> Self {
        let manifest =
            VistaArtifactManifest::new(engine, routes.len(), server_actions, client_modules);

        Self {
            name: name.into(),
            routes,
            manifest,
        }
    }
}
