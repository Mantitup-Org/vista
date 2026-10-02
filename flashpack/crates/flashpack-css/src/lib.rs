#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CssPipeline {
    Global,
    Module,
}

pub fn classify_css(path: &str) -> CssPipeline {
    let normalized = path.replace('\\', "/");
    if normalized.ends_with(".module.css") {
        CssPipeline::Module
    } else {
        CssPipeline::Global
    }
}

pub fn collect_imports(css: &str) -> Vec<String> {
    let bytes = css.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            i = skip_block_comment(bytes, i);
            continue;
        }
        if bytes[i] == b'"' || bytes[i] == b'\'' {
            i = skip_quoted(bytes, i);
            continue;
        }
        if is_import_at(bytes, i) {
            let after = i + "@import".len();
            if let Some((spec, rel)) = parse_import_target(&css[after..]) {
                if !out.iter().any(|seen| seen == &spec) {
                    out.push(spec);
                }
                i = after + rel;
                continue;
            }
        }
        i += css[i..].chars().next().map(|ch| ch.len_utf8()).unwrap_or(1);
    }
    out
}

pub fn local_class(file: &str, class_name: &str) -> String {
    // FNV-1a 32-bit of file\0class_name; suffix is the low 24 bits as 6 lowercase hex digits.
    let mut hash: u32 = 0x811c9dc5;
    for byte in file
        .bytes()
        .chain(std::iter::once(0u8))
        .chain(class_name.bytes())
    {
        hash ^= u32::from(byte);
        hash = hash.wrapping_mul(0x0100_0193);
    }
    format!("{class_name}_{:06x}", hash & 0x00ff_ffff)
}

pub fn rewrite_locals(file: &str, css: &str) -> String {
    let bytes = css.as_bytes();
    let mut out = String::with_capacity(css.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            let start = i;
            i = skip_block_comment(bytes, i);
            out.push_str(&css[start..i]);
            continue;
        }
        if bytes[i] == b'"' || bytes[i] == b'\'' {
            let start = i;
            i = skip_quoted(bytes, i);
            out.push_str(&css[start..i]);
            continue;
        }
        if bytes[i..].starts_with(b":local(") {
            if let Some((name, rel)) = parse_local(&css[i..]) {
                out.push_str(&local_class(file, name));
                i += rel;
                continue;
            }
        }
        let ch = css[i..].chars().next().unwrap_or('\u{FFFD}');
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn is_import_at(bytes: &[u8], i: usize) -> bool {
    let token = b"@import";
    if i + token.len() > bytes.len() || !bytes[i..].starts_with(token) {
        return false;
    }
    if i > 0 {
        let prev = bytes[i - 1];
        if prev.is_ascii_alphanumeric() || prev == b'_' || prev == b'-' {
            return false;
        }
    }
    let after = i + token.len();
    if after < bytes.len() {
        let next = bytes[after];
        if next.is_ascii_alphanumeric() || next == b'_' || next == b'-' {
            return false;
        }
    }
    true
}

fn parse_import_target(s: &str) -> Option<(String, usize)> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    if i >= bytes.len() {
        return None;
    }
    if bytes[i] == b'"' || bytes[i] == b'\'' {
        return parse_quoted(s, i);
    }
    if !starts_with_url(&bytes[i..]) {
        return None;
    }
    i += 3;
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    if i >= bytes.len() || bytes[i] != b'(' {
        return None;
    }
    i += 1;
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    let (spec, after_quote) = parse_quoted(s, i)?;
    i = after_quote;
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    if i >= bytes.len() || bytes[i] != b')' {
        return None;
    }
    Some((spec, i + 1))
}

fn starts_with_url(bytes: &[u8]) -> bool {
    bytes.len() >= 3
        && bytes[0].eq_ignore_ascii_case(&b'u')
        && bytes[1].eq_ignore_ascii_case(&b'r')
        && bytes[2].eq_ignore_ascii_case(&b'l')
        && (bytes.len() == 3
            || !(bytes[3].is_ascii_alphanumeric() || bytes[3] == b'_' || bytes[3] == b'-'))
}

fn parse_quoted(s: &str, i: usize) -> Option<(String, usize)> {
    let bytes = s.as_bytes();
    if i >= bytes.len() || (bytes[i] != b'"' && bytes[i] != b'\'') {
        return None;
    }
    let quote = bytes[i];
    let start = i + 1;
    let mut j = start;
    while j < bytes.len() && bytes[j] != quote {
        if bytes[j] == b'\\' && j + 1 < bytes.len() {
            j += 2;
            continue;
        }
        if bytes[j] == b'\n' {
            return None;
        }
        j += 1;
    }
    if j >= bytes.len() {
        return None;
    }
    Some((s[start..j].to_string(), j + 1))
}

fn parse_local(s: &str) -> Option<(&str, usize)> {
    let rest = s.strip_prefix(":local(")?;
    let bytes = rest.as_bytes();
    let mut i = 0;
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    if i < bytes.len() && bytes[i] == b'.' {
        i += 1;
        while i < bytes.len() && bytes[i].is_ascii_whitespace() {
            i += 1;
        }
    }
    let start = i;
    if i >= bytes.len() || !is_class_start(bytes[i]) {
        return None;
    }
    i += 1;
    while i < bytes.len() && is_class_cont(bytes[i]) {
        i += 1;
    }
    let name = &rest[start..i];
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    if i >= bytes.len() || bytes[i] != b')' {
        return None;
    }
    Some((name, ":local(".len() + i + 1))
}

fn is_class_start(byte: u8) -> bool {
    byte.is_ascii_alphabetic() || byte == b'_'
}

fn is_class_cont(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-'
}

fn skip_block_comment(bytes: &[u8], i: usize) -> usize {
    let mut j = i + 2;
    while j + 1 < bytes.len() && !(bytes[j] == b'*' && bytes[j + 1] == b'/') {
        j += 1;
    }
    if j + 1 < bytes.len() {
        j + 2
    } else {
        bytes.len()
    }
}

fn skip_quoted(bytes: &[u8], i: usize) -> usize {
    let quote = bytes[i];
    let mut j = i + 1;
    while j < bytes.len() {
        if bytes[j] == b'\\' && j + 1 < bytes.len() {
            // CSS line continuation: \ + LF, \ + CR, or \ + CRLF stays inside the string.
            if bytes[j + 1] == b'\r' && j + 2 < bytes.len() && bytes[j + 2] == b'\n' {
                j += 3;
            } else {
                j += 2;
            }
            continue;
        }
        if bytes[j] == quote {
            return j + 1;
        }
        if bytes[j] == b'\n' || bytes[j] == b'\r' {
            return i + 1;
        }
        j += 1;
    }
    bytes.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_module_and_global_css() {
        assert_eq!(classify_css("src/app.module.css"), CssPipeline::Module);
        assert_eq!(classify_css("src\\app.module.css"), CssPipeline::Module);
        assert_eq!(classify_css("src/app.css"), CssPipeline::Global);
        assert_eq!(classify_css("src/app.module.scss"), CssPipeline::Global);
        assert_eq!(classify_css("not-css.js"), CssPipeline::Global);
    }

    #[test]
    fn collects_import_forms_in_order_without_duplicates() {
        let css = r#"
            @import "a.css";
            @import 'b.css';
            @import url("c.css");
            @import URL( 'b.css' );
            @import "a.css";
            /* @import "hidden.css"; */
            body { content: "@import \"nope.css\""; }
            @importfoo "skip.css";
        "#;
        assert_eq!(
            collect_imports(css),
            vec![
                "a.css".to_string(),
                "b.css".to_string(),
                "c.css".to_string()
            ]
        );
        assert!(collect_imports("body { color: red; }").is_empty());
    }

    #[test]
    fn local_class_is_stable_fnv_suffix() {
        assert_eq!(local_class("app.module.css", "Button"), "Button_20021d");
        assert_eq!(
            local_class("app.module.css", "Button"),
            local_class("app.module.css", "Button")
        );
        assert_ne!(
            local_class("app.module.css", "Button"),
            local_class("app.module.css", "Icon")
        );
        assert_ne!(
            local_class("app.module.css", "Button"),
            local_class("other.css", "Button")
        );
        let hashed = local_class("f.css", "a");
        let suffix = hashed.trim_start_matches("a_");
        assert_eq!(suffix.len(), 6);
        assert!(suffix
            .chars()
            .all(|ch| ch.is_ascii_hexdigit() && !ch.is_ascii_uppercase()));
    }

    #[test]
    fn rewrites_local_selectors_and_leaves_other_css() {
        let css = ".Button { color: red; }\n:local(.Button):hover { }\n:local( icon ) { }\n:local(1bad) { }";
        let out = rewrite_locals("app.module.css", css);
        assert!(out.starts_with(".Button { color: red; }\n"));
        assert!(out.contains("Button_20021d:hover"));
        assert!(out.contains(&local_class("app.module.css", "icon")));
        assert!(out.contains(":local(1bad)"));
        assert!(!out.contains(":local(.Button)"));
        assert!(!out.contains(":local( icon )"));
        assert_eq!(
            rewrite_locals("app.module.css", ":local(.Button)"),
            rewrite_locals("app.module.css", ":local(Button)")
        );
    }

    #[test]
    fn rewrite_locals_ignores_locals_inside_crlf_continued_strings() {
        let css = ".a { content: \"hello\\\r\n:local(.Button)\"; }\n:local(.Icon)";
        let out = rewrite_locals("app.module.css", css);
        assert!(
            out.contains(":local(.Button)"),
            "continued string was rewritten: {out}"
        );
        assert!(
            !out.contains("Button_"),
            "class inside a continued string was hashed: {out}"
        );
        assert!(
            out.contains(&local_class("app.module.css", "Icon")),
            "{out}"
        );
    }
}
