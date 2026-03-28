pub fn normalize_engine(value: &str) -> &str {
    match value {
        "webpack" => "default",
        other => other,
    }
}
