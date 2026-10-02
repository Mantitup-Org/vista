pub fn plugin_name() -> &'static str {
    "vista-error-code-swc-plugin"
}

pub fn encode_error_code(code: &str) -> String {
    if let Some(stripped) = code.strip_prefix("VISTA_") {
        if is_valid_code(stripped) {
            return format!("VISTA_{stripped}");
        }
    }
    format!("VISTA_{code}")
}

pub fn is_valid_code(code: &str) -> bool {
    !code.is_empty()
        && code
            .chars()
            .all(|ch| ch.is_ascii_uppercase() || ch.is_ascii_digit() || ch == '_')
}

pub fn decode_error_code(token: &str) -> Option<&str> {
    let code = token.strip_prefix("VISTA_")?;
    is_valid_code(code).then_some(code)
}

/// Find `VISTA_` codes in source, in order, without duplicates.
pub fn find_error_codes(source: &str) -> Vec<String> {
    let bytes = source.as_bytes();
    let marker = b"VISTA_";
    let mut found = Vec::new();
    let mut index = 0;
    while index + marker.len() <= bytes.len() {
        if &bytes[index..index + marker.len()] == marker {
            let start = index + marker.len();
            let mut end = start;
            while end < bytes.len() && is_code_byte(bytes[end]) {
                end += 1;
            }
            if end > start {
                let code = source[start..end].to_string();
                if !found.contains(&code) {
                    found.push(code);
                }
                index = end;
                continue;
            }
        }
        index += 1;
    }
    found
}

fn is_code_byte(byte: u8) -> bool {
    byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_'
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_and_scan() {
        assert_eq!(encode_error_code("ROUTE_MISSING"), "VISTA_ROUTE_MISSING");
        assert_eq!(encode_error_code("VISTA_ROUTE_MISSING"), "VISTA_ROUTE_MISSING");
        assert_eq!(decode_error_code("VISTA_ROUTE_MISSING"), Some("ROUTE_MISSING"));
        assert_eq!(decode_error_code("ROUTE_MISSING"), None);
        assert_eq!(
            find_error_codes("throw new Error('VISTA_ROUTE_MISSING') // VISTA_ROUTE_MISSING VISTA_BAD_PAGE"),
            vec!["ROUTE_MISSING".to_string(), "BAD_PAGE".to_string()]
        );
    }

    #[test]
    fn lowercase_is_not_a_code() {
        assert!(!is_valid_code("route"));
        assert!(decode_error_code("VISTA_route").is_none());
    }
}
