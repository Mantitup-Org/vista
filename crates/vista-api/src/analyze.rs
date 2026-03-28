use vista_core::{VistaEngine, VistaRouteDefinition, VistaRuntimeConfig};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiAnalysisSummary {
    pub engine: VistaEngine,
    pub route_count: usize,
    pub dynamic_routes: usize,
}

pub fn analyze_runtime(
    config: &VistaRuntimeConfig,
    routes: &[VistaRouteDefinition],
) -> ApiAnalysisSummary {
    let dynamic_routes = routes
        .iter()
        .filter(|route| !matches!(route.kind, vista_core::VistaRouteKind::Static))
        .count();

    ApiAnalysisSummary {
        engine: config.engine_variant(),
        route_count: routes.len(),
        dynamic_routes,
    }
}
