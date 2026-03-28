#[derive(Debug, Clone)]
pub struct NodeLaunchOptions {
    pub entry: String,
}

impl NodeLaunchOptions {
    pub fn new(entry: impl Into<String>) -> Self {
        Self { entry: entry.into() }
    }
}
