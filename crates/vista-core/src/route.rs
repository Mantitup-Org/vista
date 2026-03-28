use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum VistaRouteKind {
    Static,
    Dynamic,
    CatchAll,
    ParallelSlot,
    Interception,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VistaRouteDefinition {
    pub route: String,
    pub kind: VistaRouteKind,
    pub segment_count: usize,
}

impl VistaRouteDefinition {
    pub fn new(route: impl Into<String>, kind: VistaRouteKind) -> Self {
        let route = route.into();
        let segment_count = route
            .split('/')
            .filter(|segment| !segment.is_empty())
            .count();

        Self {
            route,
            kind,
            segment_count,
        }
    }
}
