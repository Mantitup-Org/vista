#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServerActionDescriptor {
    pub id: String,
    pub file_path: String,
    pub export_name: String,
    pub inline: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ServerActionManifest {
    pub actions: Vec<ServerActionDescriptor>,
}

impl ServerActionManifest {
    pub fn inline_count(&self) -> usize {
        self.actions.iter().filter(|action| action.inline).count()
    }
}
