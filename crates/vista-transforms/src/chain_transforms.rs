use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TransformChain {
    pub stages: Vec<String>,
}

impl TransformChain {
    pub fn vista_default() -> Self {
        Self {
            stages: vec![
                "client-directive".to_string(),
                "react-compiler".to_string(),
                "rsc-manifest".to_string(),
            ],
        }
    }
}
