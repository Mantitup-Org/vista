#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TraceRecord {
    pub label: String,
    pub phase: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TraceLog {
    records: Vec<TraceRecord>,
}

impl TraceLog {
    pub fn new() -> Self {
        Self {
            records: Vec::new(),
        }
    }

    pub fn push(&mut self, record: TraceRecord) {
        self.records.push(record);
    }

    pub fn by_phase(&self, phase: &str) -> Vec<&TraceRecord> {
        self.records
            .iter()
            .filter(|record| record.phase == phase)
            .collect()
    }

    pub fn len(&self) -> usize {
        self.records.len()
    }

    pub fn is_empty(&self) -> bool {
        self.records.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_by_phase_and_keeps_order() {
        let mut log = TraceLog::new();
        assert!(log.is_empty());
        assert_eq!(log.len(), 0);

        log.push(TraceRecord {
            label: "entry".to_string(),
            phase: "resolve".to_string(),
        });
        log.push(TraceRecord {
            label: "sheet".to_string(),
            phase: "css".to_string(),
        });
        log.push(TraceRecord {
            label: "alias".to_string(),
            phase: "resolve".to_string(),
        });

        assert_eq!(log.len(), 3);
        let resolved = log.by_phase("resolve");
        assert_eq!(
            resolved
                .iter()
                .map(|record| record.label.as_str())
                .collect::<Vec<_>>(),
            vec!["entry", "alias"]
        );
        assert_eq!(log.by_phase("css").len(), 1);
        assert!(log.by_phase("trace").is_empty());
    }
}
