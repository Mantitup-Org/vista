#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EcmascriptTarget {
    Browser,
    Server,
}

/// Leading directive prologue: string-literal statements before other code.
pub fn directives(source: &str) -> Vec<String> {
    let mut found = Vec::new();
    let mut rest = source;
    loop {
        rest = rest.trim_start_matches(|c: char| c.is_whitespace());
        if rest.is_empty() {
            break;
        }
        let Some((body, after)) = read_leading_string(rest) else {
            break;
        };
        let after_horizontal = after.trim_start_matches([' ', '\t']);
        let next = if let Some(after_semi) = after_horizontal.strip_prefix(';') {
            after_semi
        } else if after_horizontal.is_empty()
            || after_horizontal.starts_with('\n')
            || after_horizontal.starts_with('\r')
        {
            after_horizontal
        } else {
            break;
        };
        if body == "use client" || body == "use server" {
            found.push(body.to_string());
        }
        rest = next;
    }
    found
}

pub fn target_for_source(source: &str) -> EcmascriptTarget {
    if directives(source).iter().any(|directive| directive == "use client") {
        EcmascriptTarget::Browser
    } else {
        EcmascriptTarget::Server
    }
}

pub fn import_specifiers(source: &str) -> Vec<String> {
    let chars: Vec<char> = source.chars().collect();
    let mut specifiers = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '/' && chars.get(i + 1) == Some(&'/') {
            i += 2;
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
            continue;
        }
        if c == '/' && chars.get(i + 1) == Some(&'*') {
            i += 2;
            while i < chars.len() {
                if chars[i] == '*' && chars.get(i + 1) == Some(&'/') {
                    i += 2;
                    break;
                }
                i += 1;
            }
            continue;
        }
        if c == '\'' || c == '"' || c == '`' {
            i = skip_quoted(&chars, i);
            continue;
        }
        if is_ident_start(c) {
            let start = i;
            i += 1;
            while i < chars.len() && is_ident_continue(chars[i]) {
                i += 1;
            }
            let word: String = chars[start..i].iter().collect();
            if word == "from" {
                let j = skip_ws_chars(&chars, i);
                if matches!(chars.get(j), Some('\'' | '"')) {
                    if let Some((spec, next)) = read_quoted(&chars, j) {
                        specifiers.push(spec);
                        i = next;
                    }
                }
            } else if word == "import" {
                let mut j = skip_ws_chars(&chars, i);
                if chars.get(j) == Some(&'(') {
                    j = skip_ws_chars(&chars, j + 1);
                    if matches!(chars.get(j), Some('\'' | '"')) {
                        if let Some((spec, next)) = read_quoted(&chars, j) {
                            specifiers.push(spec);
                            i = next;
                        }
                    }
                }
            }
            continue;
        }
        i += 1;
    }
    specifiers
}

pub fn has_jsx(source: &str) -> bool {
    let chars: Vec<char> = source.chars().collect();
    let mut modes = vec![ScanMode::Code];
    let mut braces = vec![0i32];
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        match *modes.last().expect("scan mode") {
            ScanMode::Line => {
                if c == '\n' {
                    modes.pop();
                }
                i += 1;
            }
            ScanMode::Block => {
                if c == '*' && chars.get(i + 1) == Some(&'/') {
                    modes.pop();
                    i += 2;
                } else {
                    i += 1;
                }
            }
            ScanMode::Single | ScanMode::Double => {
                let quote = if matches!(modes.last(), Some(ScanMode::Single)) {
                    '\''
                } else {
                    '"'
                };
                if c == '\\' {
                    i += if i + 1 < chars.len() { 2 } else { 1 };
                } else if c == quote {
                    modes.pop();
                    i += 1;
                } else {
                    i += 1;
                }
            }
            ScanMode::Template => {
                if c == '\\' {
                    i += if i + 1 < chars.len() { 2 } else { 1 };
                } else if c == '`' {
                    modes.pop();
                    i += 1;
                } else if c == '$' && chars.get(i + 1) == Some(&'{') {
                    modes.push(ScanMode::Code);
                    braces.push(0);
                    i += 1;
                } else {
                    i += 1;
                }
            }
            ScanMode::Code => {
                if c == '/' && chars.get(i + 1) == Some(&'/') {
                    modes.push(ScanMode::Line);
                    i += 2;
                } else if c == '/' && chars.get(i + 1) == Some(&'*') {
                    modes.push(ScanMode::Block);
                    i += 2;
                } else if c == '\'' {
                    modes.push(ScanMode::Single);
                    i += 1;
                } else if c == '"' {
                    modes.push(ScanMode::Double);
                    i += 1;
                } else if c == '`' {
                    modes.push(ScanMode::Template);
                    i += 1;
                } else if c == '<' {
                    if chars.get(i + 1).is_some_and(|next| next.is_ascii_alphabetic()) {
                        return true;
                    }
                    i += 1;
                } else if c == '{' {
                    if let Some(depth) = braces.last_mut() {
                        *depth += 1;
                    }
                    i += 1;
                } else if c == '}' {
                    if let Some(depth) = braces.last_mut() {
                        if *depth > 0 {
                            *depth -= 1;
                        }
                        if *depth == 0 && modes.len() > 1 {
                            modes.pop();
                            braces.pop();
                        }
                    }
                    i += 1;
                } else {
                    i += 1;
                }
            }
        }
    }
    false
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ScanMode {
    Code,
    Line,
    Block,
    Single,
    Double,
    Template,
}

fn read_leading_string(source: &str) -> Option<(&str, &str)> {
    let mut iter = source.char_indices();
    let (_, quote) = iter.next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let mut escaped = false;
    for (idx, c) in source.char_indices().skip(1) {
        if escaped {
            escaped = false;
            continue;
        }
        if c == '\\' {
            escaped = true;
            continue;
        }
        if c == '\n' || c == '\r' {
            return None;
        }
        if c == quote {
            let body = &source[quote.len_utf8()..idx];
            let after = &source[idx + c.len_utf8()..];
            return Some((body, after));
        }
    }
    None
}

fn is_ident_start(c: char) -> bool {
    c.is_ascii_alphabetic() || c == '_' || c == '$'
}

fn is_ident_continue(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '$'
}

fn skip_ws_chars(chars: &[char], mut i: usize) -> usize {
    while i < chars.len() && chars[i].is_whitespace() {
        i += 1;
    }
    i
}

fn read_quoted(chars: &[char], start: usize) -> Option<(String, usize)> {
    let quote = *chars.get(start)?;
    if quote != '\'' && quote != '"' && quote != '`' {
        return None;
    }
    let mut i = start + 1;
    let mut value = String::new();
    while i < chars.len() {
        let c = chars[i];
        if c == '\\' {
            value.push('\\');
            if i + 1 < chars.len() {
                value.push(chars[i + 1]);
                i += 2;
            } else {
                i += 1;
            }
            continue;
        }
        if c == quote {
            return Some((value, i + 1));
        }
        if quote != '`' && (c == '\n' || c == '\r') {
            return None;
        }
        value.push(c);
        i += 1;
    }
    None
}

fn skip_quoted(chars: &[char], start: usize) -> usize {
    if let Some((_, next)) = read_quoted(chars, start) {
        return next;
    }
    let quote = chars.get(start).copied().unwrap_or('\0');
    if quote == '`' {
        return chars.len();
    }
    let mut i = start + 1;
    while i < chars.len() && chars[i] != '\n' {
        i += 1;
    }
    i
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn directives_collect_client_and_server_in_order() {
        let source = "  \n\"use client\";\n'use server'\nconst x = 1;\n";
        assert_eq!(
            directives(source),
            vec!["use client".to_string(), "use server".to_string()]
        );
        assert_eq!(target_for_source(source), EcmascriptTarget::Browser);
    }

    #[test]
    fn server_directive_and_strict_prologue_still_scan() {
        let source = "\"use strict\";\n'use server';\nexport function action() {}\n";
        assert_eq!(directives(source), vec!["use server".to_string()]);
        assert_eq!(target_for_source(source), EcmascriptTarget::Server);
    }

    #[test]
    fn directives_stop_at_other_code() {
        let source = "const x = 1;\n\"use client\";\n";
        assert!(directives(source).is_empty());
        assert_eq!(target_for_source(source), EcmascriptTarget::Server);
        assert!(directives("(\"use client\")").is_empty());
        assert!(directives("// note\n\"use client\";").is_empty());
    }

    #[test]
    fn import_specifiers_keep_from_and_dynamic_order() {
        let source = r#"
            import foo from 'react';
            export { bar } from "vue";
            const lazy = import("./mod");
            const again = import(
                "later"
            );
        "#;
        assert_eq!(
            import_specifiers(source),
            vec![
                "react".to_string(),
                "vue".to_string(),
                "./mod".to_string(),
                "later".to_string()
            ]
        );
    }

    #[test]
    fn import_specifiers_ignore_comments_strings_and_bare_imports() {
        let source = r#"
            import "side-effect";
            import.meta.url;
            const text = "from 'nope'";
            // from "nope"
            /* import("nope") */
            const fromage = 1;
            import("yes");
        "#;
        assert_eq!(import_specifiers(source), vec!["yes".to_string()]);
    }

    #[test]
    fn has_jsx_detects_opening_tags_outside_strings_and_comments() {
        assert!(has_jsx("const view = <div className=\"x\" />;"));
        assert!(has_jsx("/* no */ <Span />"));
        assert!(has_jsx("const node = `text ${<Box />} end`;"));
        assert!(!has_jsx("const n = 1 < 2;"));
        assert!(!has_jsx("const n = 1 <= 2;"));
        assert!(!has_jsx("const s = \"<div>\";"));
        assert!(!has_jsx("const s = '<div>';"));
        assert!(!has_jsx("const s = `<div>`;"));
        assert!(!has_jsx("// <div>\nconst n = 1;"));
        assert!(!has_jsx("/* <div>"));
        assert!(!has_jsx("const s = `\\${<div>}`;"));
        assert!(!has_jsx("const end = a <"));
        assert!(!has_jsx(r#"const s = `pre ${"<div>"} post`;"#));
        assert!(!has_jsx(r#"const s = `pre ${'<div>'} post`;"#));
        assert!(has_jsx(r#"const s = `pre ${<div />} post`;"#));
    }
}
