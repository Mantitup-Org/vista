#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlashTaskEnvVar {
    pub key: String,
    pub value: String,
}

pub fn capture_env(keys: &[&str]) -> Vec<FlashTaskEnvVar> {
    keys.iter()
        .filter_map(|key| {
            std::env::var(key).ok().map(|value| FlashTaskEnvVar {
                key: (*key).to_string(),
                value,
            })
        })
        .collect()
}
