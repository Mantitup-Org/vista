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

    pub fn contains(&self, step: &str) -> bool {
        self.steps.iter().any(|candidate| *candidate == step)
    }
}

/// Walks a schedule one step at a time. A step that is not next is rejected.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TasklessRun {
    schedule: TasklessSchedule,
    index: usize,
}

impl TasklessRun {
    pub fn start(mode: TasklessMode) -> Self {
        Self {
            schedule: TasklessSchedule::default_for(mode),
            index: 0,
        }
    }

    pub fn expected(&self) -> Option<&'static str> {
        self.schedule.steps.get(self.index).copied()
    }

    pub fn is_complete(&self) -> bool {
        self.index == self.schedule.steps.len()
    }

    pub fn advance(&mut self, step: &str) -> Result<&'static str, String> {
        let expected = self.expected().ok_or_else(|| {
            format!("schedule is already complete, refused extra step {step}")
        })?;
        if step != expected {
            return Err(format!("expected {expected}, got {step}"));
        }
        self.index += 1;
        Ok(expected)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enabled_mode_reuses_state_instead_of_queueing_work() {
        let mut run = TasklessRun::start(TasklessMode::Enabled);
        assert_eq!(run.advance("scan").unwrap(), "scan");
        assert!(run.advance("queue-work").is_err());
        assert_eq!(run.advance("reuse-state").unwrap(), "reuse-state");
        assert_eq!(run.advance("serve").unwrap(), "serve");
        assert!(run.is_complete());
        assert!(run.advance("serve").is_err());
    }

    #[test]
    fn disabled_mode_queues_work() {
        let schedule = TasklessSchedule::default_for(TasklessMode::Disabled);
        assert!(schedule.contains("queue-work"));
        assert!(!schedule.contains("reuse-state"));
    }
}
