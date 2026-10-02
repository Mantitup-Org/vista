#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlashHmrMessage {
    pub route: String,
    pub event: String,
}

impl FlashHmrMessage {
    pub fn to_json(&self) -> String {
        format!(
            "{{\"route\":{},\"event\":{}}}",
            json_string(&self.route),
            json_string(&self.event)
        )
    }

    pub fn parse(json: &str) -> Result<Self, String> {
        let mut i = 0;
        skip_ws(json, &mut i);
        expect(json, &mut i, '{')?;
        let mut route = None;
        let mut event = None;
        let mut first = true;
        loop {
            skip_ws(json, &mut i);
            if starts_with_char(json, i, '}') {
                i += 1;
                break;
            }
            if !first {
                expect(json, &mut i, ',')?;
                skip_ws(json, &mut i);
                if starts_with_char(json, i, '}') {
                    return Err("trailing comma".to_string());
                }
            }
            first = false;
            let key = parse_string(json, &mut i)?;
            expect(json, &mut i, ':')?;
            skip_ws(json, &mut i);
            if !starts_with_char(json, i, '"') {
                return Err(format!("field `{key}` must be a string"));
            }
            let value = parse_string(json, &mut i)?;
            match key.as_str() {
                "route" => {
                    if route.is_some() {
                        return Err("duplicate field `route`".to_string());
                    }
                    route = Some(value);
                }
                "event" => {
                    if event.is_some() {
                        return Err("duplicate field `event`".to_string());
                    }
                    event = Some(value);
                }
                other => return Err(format!("unexpected field `{other}`")),
            }
        }
        skip_ws(json, &mut i);
        if i != json.len() {
            return Err("trailing data".to_string());
        }
        let route = route.ok_or_else(|| "missing field `route`".to_string())?;
        let event = event.ok_or_else(|| "missing field `event`".to_string())?;
        Ok(Self { route, event })
    }
}

pub fn is_update(message: &FlashHmrMessage) -> bool {
    message.event == "update" || message.event == "reload"
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

fn skip_ws(s: &str, i: &mut usize) {
    while let Some(c) = s[*i..].chars().next() {
        if c.is_whitespace() {
            *i += c.len_utf8();
        } else {
            break;
        }
    }
}

fn starts_with_char(s: &str, i: usize, expected: char) -> bool {
    s[i..].chars().next() == Some(expected)
}

fn expect(s: &str, i: &mut usize, expected: char) -> Result<(), String> {
    skip_ws(s, i);
    match s[*i..].chars().next() {
        Some(c) if c == expected => {
            *i += c.len_utf8();
            Ok(())
        }
        Some(c) => Err(format!("expected '{expected}', found '{c}'")),
        None => Err(format!("expected '{expected}', found end of input")),
    }
}

fn parse_string(s: &str, i: &mut usize) -> Result<String, String> {
    skip_ws(s, i);
    if !starts_with_char(s, *i, '"') {
        return Err("expected string".to_string());
    }
    *i += 1;
    let mut out = String::new();
    while *i < s.len() {
        let c = s[*i..].chars().next().unwrap();
        if c == '"' {
            *i += c.len_utf8();
            return Ok(out);
        }
        if c == '\\' {
            *i += c.len_utf8();
            let esc = s[*i..].chars().next().ok_or_else(|| "bad escape".to_string())?;
            *i += esc.len_utf8();
            match esc {
                '"' => out.push('"'),
                '\\' => out.push('\\'),
                '/' => out.push('/'),
                'n' => out.push('\n'),
                'r' => out.push('\r'),
                't' => out.push('\t'),
                'b' => out.push('\u{0008}'),
                'f' => out.push('\u{000c}'),
                'u' => {
                    let unit = decode_hex4(s, i)?;
                    *i += 4;
                    let ch = decode_json_unicode(s, i, unit)?;
                    out.push(ch);
                }
                _ => return Err("bad escape".to_string()),
            }
            continue;
        }
        if (c as u32) < 0x20 {
            return Err("raw control character in string".to_string());
        }
        out.push(c);
        *i += c.len_utf8();
    }
    Err("unterminated string".to_string())
}

fn decode_hex4(s: &str, i: &mut usize) -> Result<u32, String> {
    if *i + 4 > s.len() {
        return Err("bad unicode escape".to_string());
    }
    let hex = &s[*i..*i + 4];
    if !hex.chars().all(|h| h.is_ascii_hexdigit()) {
        return Err("bad unicode escape".to_string());
    }
    u32::from_str_radix(hex, 16).map_err(|_| "bad unicode escape".to_string())
}

/// Decodes one JSON `\u` unit, including UTF-16 surrogate pairs.
fn decode_json_unicode(s: &str, i: &mut usize, unit: u32) -> Result<char, String> {
    if (0xD800..=0xDBFF).contains(&unit) {
        if !s[*i..].starts_with("\\u") {
            return Err("bad unicode escape".to_string());
        }
        *i += 2;
        let low = decode_hex4(s, i)?;
        *i += 4;
        if !(0xDC00..=0xDFFF).contains(&low) {
            return Err("bad unicode escape".to_string());
        }
        let code = 0x10000 + (((unit - 0xD800) << 10) | (low - 0xDC00));
        return char::from_u32(code).ok_or_else(|| "bad unicode escape".to_string());
    }
    if (0xDC00..=0xDFFF).contains(&unit) {
        return Err("bad unicode escape".to_string());
    }
    char::from_u32(unit).ok_or_else(|| "bad unicode escape".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_round_trip_escapes_quotes_and_backslashes() {
        let message = FlashHmrMessage {
            route: "a\"b\\c\n/home".to_string(),
            event: "update".to_string(),
        };
        let json = message.to_json();
        assert_eq!(json, "{\"route\":\"a\\\"b\\\\c\\n/home\",\"event\":\"update\"}");
        assert_eq!(FlashHmrMessage::parse(&json).unwrap(), message);
        assert!(is_update(&message));
    }

    #[test]
    fn parse_allows_whitespace_and_either_field_order() {
        let parsed = FlashHmrMessage::parse(
            " \n{ \"event\" : \"reload\" , \"route\" : \"/docs\" } \n",
        )
        .unwrap();
        assert_eq!(
            parsed,
            FlashHmrMessage {
                route: "/docs".to_string(),
                event: "reload".to_string(),
            }
        );
        assert!(is_update(&parsed));
        let idle = FlashHmrMessage {
            route: "/".to_string(),
            event: "connected".to_string(),
        };
        assert!(!is_update(&idle));
        assert!(!is_update(&FlashHmrMessage {
            route: "/".to_string(),
            event: "Update".to_string(),
        }));
    }

    #[test]
    fn parse_rejects_missing_fields_and_non_strings() {
        assert!(FlashHmrMessage::parse("").is_err());
        assert!(FlashHmrMessage::parse("{}").is_err());
        assert!(FlashHmrMessage::parse("{\"event\":\"update\"}").is_err());
        assert!(FlashHmrMessage::parse("{\"route\":\"/\",\"event\":1}").is_err());
        assert!(FlashHmrMessage::parse("{\"route\":null,\"event\":\"update\"}").is_err());
        assert!(FlashHmrMessage::parse("{\"route\":\"/\",\"event\":\"update\",\"extra\":\"x\"}").is_err());
        assert!(FlashHmrMessage::parse("[\"no\"]").is_err());
        assert!(FlashHmrMessage::parse("{\"route\":\"/\",\"event\":\"update\",}").is_err());
        assert!(FlashHmrMessage::parse("{\"route\":\"/\",\"route\":\"/\",\"event\":\"update\"}").is_err());
    }

    #[test]
    fn parse_decodes_utf16_surrogate_pairs() {
        let parsed = FlashHmrMessage::parse(r#"{"route":"\uD83D\uDE00","event":"update"}"#).unwrap();
        assert_eq!(parsed.route, "😀");
        assert_eq!(parsed.event, "update");
        assert!(FlashHmrMessage::parse(r#"{"route":"\uD800","event":"update"}"#).is_err());
        assert!(FlashHmrMessage::parse(r#"{"route":"\uDE00","event":"update"}"#).is_err());
        assert!(FlashHmrMessage::parse(r#"{"route":"\uD83D\uD83D","event":"update"}"#).is_err());
    }
}
