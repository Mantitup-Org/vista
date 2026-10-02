use vista_build::{BuildPipelinePlan, VistaRuntimeConfig};

/// Confirms the build plan the rest of the crate exposes is the one tests run against.
pub fn smoke() -> bool {
    let plan = BuildPipelinePlan::from_config(&VistaRuntimeConfig::default());
    plan.owner == "node-runtime"
        && plan.phases == ["scan", "manifest", "emit", "start"]
        && plan.next_after("emit") == Some("start")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_pipeline_smoke() {
        assert!(smoke());
    }
}
