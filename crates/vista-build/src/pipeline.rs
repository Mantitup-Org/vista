use vista_core::{VistaEngine, VistaRuntimeConfig};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BuildPipelinePlan {
    pub engine: VistaEngine,
    pub owner: &'static str,
    pub phases: Vec<&'static str>,
}

impl BuildPipelinePlan {
    pub fn from_config(config: &VistaRuntimeConfig) -> Self {
        let engine = config.engine_variant();
        let owner = if engine.is_rust_backed() {
            "rust-cli"
        } else {
            "node-runtime"
        };

        Self {
            engine,
            owner,
            phases: vec!["scan", "manifest", "emit", "start"],
        }
    }

    pub fn next_after(&self, phase: &str) -> Option<&'static str> {
        let index = self.phases.iter().position(|candidate| *candidate == phase)?;
        self.phases.get(index + 1).copied()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flashpack_plan_is_owned_by_the_rust_cli() {
        let plan = BuildPipelinePlan::from_config(&VistaRuntimeConfig {
            engine: "flashpack".to_string(),
        });
        assert_eq!(plan.owner, "rust-cli");
        assert_eq!(plan.next_after("scan"), Some("manifest"));
        assert_eq!(plan.next_after("start"), None);
        assert_eq!(plan.next_after("missing"), None);
    }
}
