use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReactCompilerOptions {
    pub enabled: bool,
    pub runtime_module: String,
    pub memo_cache: bool,
}

impl Default for ReactCompilerOptions {
    fn default() -> Self {
        Self {
            enabled: true,
            runtime_module: "react/jsx-runtime".to_string(),
            memo_cache: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReactCompilerResult {
    pub optimized: bool,
    pub inserted_helpers: Vec<String>,
}

pub fn compile_react_module(source: &str, options: &ReactCompilerOptions) -> ReactCompilerResult {
    let optimized = options.enabled && source.contains("function");
    let inserted_helpers = if optimized && options.memo_cache {
        vec!["useMemoCache".to_string()]
    } else {
        Vec::new()
    };

    ReactCompilerResult {
        optimized,
        inserted_helpers,
    }
}
