pub use crate::client_directive::analyze_file as analyze_client_directive;
pub use crate::linter::{lint_component_source, VistaLintWarning};
pub use crate::react_compiler::{
    compile_react_module, ReactCompilerOptions, ReactCompilerResult,
};
