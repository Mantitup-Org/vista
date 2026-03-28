#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskState {
    Pending,
    Running,
    Complete,
}

pub trait Task {
    fn key(&self) -> &str;
    fn state(&self) -> TaskState;
}
