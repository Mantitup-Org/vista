use crate::TasklessMode;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TasklessSchedule {
    pub mode: TasklessMode,
    pub steps: Vec<&'static str>,
}

impl TasklessSchedule {
    pub fn default_for(mode: TasklessMode) -> Self {
        let steps = if mode.is_enabled() {
            vec!["scan", "reuse-state", "serve"]
        } else {
            vec!["scan", "queue-work", "serve"]
        };

        Self { mode, steps }
    }
}
