use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum VistaEngine {
    Default,
    Flashpack,
}

impl VistaEngine {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Flashpack => "flashpack",
        }
    }

    pub fn from_str(value: &str) -> Self {
        match value {
            "flashpack" | "turbopack" => Self::Flashpack,
            _ => Self::Default,
        }
    }

    pub fn is_rust_backed(self) -> bool {
        matches!(self, Self::Flashpack)
    }
}

impl Default for VistaEngine {
    fn default() -> Self {
        Self::Default
    }
}
