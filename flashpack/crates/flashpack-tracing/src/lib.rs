#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlashTraceSummary {
    pub phase: String,
    pub event_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tracer {
    phase: String,
    events: Vec<String>,
}

impl Tracer {
    pub fn new(phase: impl Into<String>) -> Self {
        Self {
            phase: phase.into(),
            events: Vec::new(),
        }
    }

    pub fn event(&mut self, name: impl Into<String>) {
        self.events.push(name.into());
    }

    pub fn summary(&self) -> FlashTraceSummary {
        FlashTraceSummary {
            phase: self.phase.clone(),
            event_count: self.events.len(),
        }
    }

    pub fn names(&self) -> &[String] {
        &self.events
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_events_in_order() {
        let mut tracer = Tracer::new("compile");
        assert_eq!(
            tracer.summary(),
            FlashTraceSummary {
                phase: "compile".to_string(),
                event_count: 0,
            }
        );
        assert!(tracer.names().is_empty());

        tracer.event("resolve");
        tracer.event(String::from("css"));
        tracer.event("emit");

        assert_eq!(
            tracer.names(),
            &["resolve".to_string(), "css".to_string(), "emit".to_string()]
        );
        assert_eq!(
            tracer.summary(),
            FlashTraceSummary {
                phase: "compile".to_string(),
                event_count: 3,
            }
        );
    }
}
