use crate::TasklessMode;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TasklessRuntime {
    pub mode: TasklessMode,
    pub label: &'static str,
}

impl TasklessRuntime {
    pub fn new(mode: TasklessMode) -> Self {
        let label = if mode.is_enabled() {
            "taskless"
        } else {
            "scheduled"
        };

        Self { mode, label }
    }
}
