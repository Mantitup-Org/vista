#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TasklessMode {
    Disabled,
    Enabled,
}

impl TasklessMode {
    pub fn is_enabled(self) -> bool {
        matches!(self, Self::Enabled)
    }
}
