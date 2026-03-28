use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VistaLintWarning {
    pub code: &'static str,
    pub message: String,
}

pub fn lint_component_source(source: &str) -> Vec<VistaLintWarning> {
    let mut warnings = Vec::new();

    if source.contains("'use client'") && source.contains("'use server'") {
        warnings.push(VistaLintWarning {
            code: "mixed-runtime-directives",
            message: "component source mixes 'use client' and 'use server' directives".to_string(),
        });
    }

    if source.contains("draftMode(") && source.contains("'use client'") {
        warnings.push(VistaLintWarning {
            code: "client-server-api-mix",
            message: "draftMode() should stay in server execution paths".to_string(),
        });
    }

    warnings
}
