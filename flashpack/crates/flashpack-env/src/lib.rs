pub fn read_mode(default_mode: &str) -> String {
    std::env::var("NODE_ENV").unwrap_or_else(|_| default_mode.to_string())
}

pub fn parse_env_file(text: &str) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    for line in text.split('\n') {
        let line = line.trim_end_matches('\r').trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = strip_export(line);
        let Some((key, raw_value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        if key.is_empty() || key.chars().any(|c| c.is_whitespace()) {
            continue;
        }
        let value = normalize_env_value(raw_value);
        if let Some((_, existing)) = pairs.iter_mut().find(|(existing_key, _)| existing_key == key) {
            *existing = value;
        } else {
            pairs.push((key.to_string(), value));
        }
    }
    pairs
}

pub fn client_public(pairs: &[(String, String)]) -> Vec<(String, String)> {
    pairs
        .iter()
        .filter(|(key, _)| key.starts_with("VISTA_PUBLIC_") || key.starts_with("NEXT_PUBLIC_"))
        .cloned()
        .collect()
}

pub fn define_map(pairs: &[(String, String)]) -> Vec<(String, String)> {
    pairs
        .iter()
        .map(|(key, value)| (format!("process.env.{key}"), json_string(value)))
        .collect()
}

fn strip_export(line: &str) -> &str {
    if let Some(rest) = line.strip_prefix("export") {
        if rest.starts_with(|c: char| c.is_whitespace()) {
            return rest.trim_start();
        }
    }
    line
}

fn normalize_env_value(raw: &str) -> String {
    let trimmed = raw.trim();
    let mut chars = trimmed.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    let last = trimmed.chars().next_back().unwrap_or(first);
    if trimmed.len() >= 2 && (first == '"' || first == '\'') && first == last {
        return trimmed[first.len_utf8()..trimmed.len() - last.len_utf8()].to_string();
    }
    trimmed.to_string()
}

fn json_string(value: &str) -> String {
    let mut out = String::from("\"");
    for c in value.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn set_node_env(value: &str) {
        #[allow(unused_unsafe)]
        unsafe {
            std::env::set_var("NODE_ENV", value);
        }
    }

    fn remove_node_env() {
        #[allow(unused_unsafe)]
        unsafe {
            std::env::remove_var("NODE_ENV");
        }
    }

    #[test]
    fn read_mode_prefers_node_env_then_default() {
        let _guard = ENV_LOCK.lock().unwrap();
        let previous = std::env::var("NODE_ENV").ok();
        set_node_env("production");
        assert_eq!(read_mode("development"), "production");
        remove_node_env();
        assert_eq!(read_mode("development"), "development");
        assert_eq!(read_mode(""), "");
        match previous {
            Some(value) => set_node_env(&value),
            None => {}
        }
    }

    #[test]
    fn parse_env_file_overrides_keep_first_seen_order() {
        let text = "\
# comment

FOO=bar
export BAR=\"baz\"
FOO=override
QUOTED='keep spaces'
  # indented
NOT_A_PAIR
=nokey
export=still
";
        assert_eq!(
            parse_env_file(text),
            vec![
                ("FOO".to_string(), "override".to_string()),
                ("BAR".to_string(), "baz".to_string()),
                ("QUOTED".to_string(), "keep spaces".to_string()),
                ("export".to_string(), "still".to_string()),
            ]
        );
    }

    #[test]
    fn client_public_and_define_map() {
        let pairs = vec![
            ("SECRET".to_string(), "no".to_string()),
            ("NEXT_PUBLIC_A".to_string(), "1".to_string()),
            ("OTHER".to_string(), "x".to_string()),
            ("VISTA_PUBLIC_B".to_string(), "a\"b\\c".to_string()),
            ("VISTA_PUBLIC".to_string(), "skip".to_string()),
        ];
        assert_eq!(
            client_public(&pairs),
            vec![
                ("NEXT_PUBLIC_A".to_string(), "1".to_string()),
                ("VISTA_PUBLIC_B".to_string(), "a\"b\\c".to_string()),
            ]
        );
        assert_eq!(
            define_map(&pairs[..1]),
            vec![("process.env.SECRET".to_string(), "\"no\"".to_string())]
        );
        assert_eq!(
            define_map(&[( "A".to_string(), "b\"c\\d".to_string() )]),
            vec![("process.env.A".to_string(), "\"b\\\"c\\\\d\"".to_string())]
        );
    }

    #[test]
    fn empty_and_comment_only_files_produce_nothing() {
        assert!(parse_env_file("").is_empty());
        assert!(parse_env_file("# only\n\n  \nexport\n").is_empty());
        assert!(client_public(&[]).is_empty());
        assert!(define_map(&[]).is_empty());
        assert_eq!(
            define_map(&[("K".to_string(), String::new())]),
            vec![("process.env.K".to_string(), "\"\"".to_string())]
        );
    }
}
