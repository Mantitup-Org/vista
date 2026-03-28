pub fn read_mode(default_mode: &str) -> String {
    std::env::var("NODE_ENV").unwrap_or_else(|_| default_mode.to_string())
}
