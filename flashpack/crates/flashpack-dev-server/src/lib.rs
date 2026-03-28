#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DevServerState {
    Idle,
    Compiling,
    Ready,
    Error,
}
