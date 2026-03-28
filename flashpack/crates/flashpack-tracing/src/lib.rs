#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlashTraceSummary {
    pub phase: String,
    pub event_count: usize,
}
