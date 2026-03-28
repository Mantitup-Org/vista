#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BuildGraphSnapshot {
    pub files: usize,
    pub routes: usize,
    pub server_actions: usize,
}

impl BuildGraphSnapshot {
    pub fn new(files: usize, routes: usize, server_actions: usize) -> Self {
        Self {
            files,
            routes,
            server_actions,
        }
    }
}
