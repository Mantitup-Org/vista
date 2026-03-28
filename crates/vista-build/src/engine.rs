use vista_core::{VistaEngine, VistaRuntimeConfig};

pub fn resolve_engine_label(config: &VistaRuntimeConfig) -> &'static str {
    resolve_engine_kind(config).as_str()
}

pub fn resolve_engine_kind(config: &VistaRuntimeConfig) -> VistaEngine {
    config.engine_variant()
}
