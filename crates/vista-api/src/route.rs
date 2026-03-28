use vista_core::VistaRouteDefinition;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiRouteSummary {
    pub route: String,
    pub segment_count: usize,
}

impl From<&VistaRouteDefinition> for ApiRouteSummary {
    fn from(route: &VistaRouteDefinition) -> Self {
        Self {
            route: route.route.clone(),
            segment_count: route.segment_count,
        }
    }
}
