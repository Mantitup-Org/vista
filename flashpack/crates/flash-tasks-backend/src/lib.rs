#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlashTaskBackendKind {
    InMemory,
    Filesystem,
}
