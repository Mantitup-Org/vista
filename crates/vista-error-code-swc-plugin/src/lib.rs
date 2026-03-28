pub fn plugin_name() -> &'static str {
    "vista-error-code-swc-plugin"
}

pub fn encode_error_code(code: &str) -> String {
    format!("VISTA_{code}")
}
