#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EntrypointKind {
    App,
    RouteHandler,
    Middleware,
    Metadata,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VistaEntrypoint {
    pub kind: EntrypointKind,
    pub relative_path: String,
}

impl VistaEntrypoint {
    pub fn new(kind: EntrypointKind, relative_path: impl Into<String>) -> Self {
        Self {
            kind,
            relative_path: relative_path.into(),
        }
    }
}
