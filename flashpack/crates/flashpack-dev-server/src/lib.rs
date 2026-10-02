mod browser;
mod compile;
mod packages;
mod serve;

pub use compile::module_specifier_url;
pub use serve::{serve, ServeOptions};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DevServerState {
    Idle,
    Compiling,
    Ready,
    Error,
}
