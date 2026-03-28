#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FixtureExpectation {
    pub fixture: String,
    pub engine: String,
    pub expected_status: &'static str,
}

impl FixtureExpectation {
    pub fn new(fixture: impl Into<String>, engine: impl Into<String>) -> Self {
        Self {
            fixture: fixture.into(),
            engine: engine.into(),
            expected_status: "ok",
        }
    }
}
