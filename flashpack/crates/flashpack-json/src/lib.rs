pub fn is_json_asset(path: &str) -> bool {
    path.ends_with(".json")
}

pub fn json_module(source: &str) -> Result<String, String> {
    let value: serde_json::Value = serde_json::from_str(source).map_err(|err| err.to_string())?;
    let compact = compact_json(source)?;
    let again: serde_json::Value = serde_json::from_str(&compact).map_err(|err| err.to_string())?;
    if again != value {
        return Err("json value changed during module emit".into());
    }
    Ok(format!("export default {compact};"))
}

pub fn named_json_exports(source: &str) -> Result<Vec<String>, String> {
    let value: serde_json::Value = serde_json::from_str(source).map_err(|err| err.to_string())?;
    let Some(object) = value.as_object() else {
        return Ok(Vec::new());
    };
    let mut keys: Vec<String> = object
        .keys()
        .filter(|key| is_js_identifier(key))
        .cloned()
        .collect();
    keys.sort();
    Ok(keys)
}

fn is_js_identifier(name: &str) -> bool {
    let mut chars = name.chars();
    match chars.next() {
        Some(ch) if ch.is_ascii_alphabetic() || ch == '_' || ch == '$' => {}
        _ => return false,
    }
    chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '$')
}

fn compact_json(source: &str) -> Result<String, String> {
    let bytes = source.as_bytes();
    let mut i = 0;
    let mut out = String::new();
    skip_ws(bytes, &mut i);
    if i >= bytes.len() {
        return Err("empty json".into());
    }
    parse_value(source, &mut i, &mut out, 0)?;
    skip_ws(bytes, &mut i);
    if i != bytes.len() {
        return Err("trailing data after json".into());
    }
    Ok(out)
}

fn parse_value(source: &str, i: &mut usize, out: &mut String, depth: usize) -> Result<(), String> {
    if depth > 128 {
        return Err("json too deep".into());
    }
    let bytes = source.as_bytes();
    if *i >= bytes.len() {
        return Err("unexpected end of json".into());
    }
    match bytes[*i] {
        b'{' => parse_object(source, i, out, depth),
        b'[' => parse_array(source, i, out, depth),
        b'"' => parse_string(source, i, out),
        b't' => parse_literal(source, i, out, "true"),
        b'f' => parse_literal(source, i, out, "false"),
        b'n' => parse_literal(source, i, out, "null"),
        b'-' | b'0'..=b'9' => parse_number(source, i, out),
        _ => Err("invalid json value".into()),
    }
}

fn parse_object(source: &str, i: &mut usize, out: &mut String, depth: usize) -> Result<(), String> {
    let bytes = source.as_bytes();
    *i += 1;
    out.push('{');
    skip_ws(bytes, i);
    if *i < bytes.len() && bytes[*i] == b'}' {
        *i += 1;
        out.push('}');
        return Ok(());
    }
    loop {
        skip_ws(bytes, i);
        parse_string(source, i, out)?;
        skip_ws(bytes, i);
        expect(bytes, i, b':')?;
        out.push(':');
        skip_ws(bytes, i);
        parse_value(source, i, out, depth + 1)?;
        skip_ws(bytes, i);
        if *i < bytes.len() && bytes[*i] == b',' {
            *i += 1;
            out.push(',');
            skip_ws(bytes, i);
            if *i < bytes.len() && bytes[*i] == b'}' {
                return Err("trailing comma".into());
            }
            continue;
        }
        expect(bytes, i, b'}')?;
        out.push('}');
        return Ok(());
    }
}

fn parse_array(source: &str, i: &mut usize, out: &mut String, depth: usize) -> Result<(), String> {
    let bytes = source.as_bytes();
    *i += 1;
    out.push('[');
    skip_ws(bytes, i);
    if *i < bytes.len() && bytes[*i] == b']' {
        *i += 1;
        out.push(']');
        return Ok(());
    }
    loop {
        skip_ws(bytes, i);
        parse_value(source, i, out, depth + 1)?;
        skip_ws(bytes, i);
        if *i < bytes.len() && bytes[*i] == b',' {
            *i += 1;
            out.push(',');
            skip_ws(bytes, i);
            if *i < bytes.len() && bytes[*i] == b']' {
                return Err("trailing comma".into());
            }
            continue;
        }
        expect(bytes, i, b']')?;
        out.push(']');
        return Ok(());
    }
}

fn parse_string(source: &str, i: &mut usize, out: &mut String) -> Result<(), String> {
    let bytes = source.as_bytes();
    if *i >= bytes.len() || bytes[*i] != b'"' {
        return Err("expected string".into());
    }
    let start = *i;
    *i += 1;
    while *i < bytes.len() {
        match bytes[*i] {
            b'"' => {
                *i += 1;
                out.push_str(&source[start..*i]);
                return Ok(());
            }
            b'\\' => {
                *i += 1;
                if *i >= bytes.len() {
                    return Err("bad escape".into());
                }
                match bytes[*i] {
                    b'"' | b'\\' | b'/' | b'b' | b'f' | b'n' | b'r' | b't' => *i += 1,
                    b'u' => {
                        *i += 1;
                        if *i + 4 > bytes.len()
                            || !bytes[*i..*i + 4]
                                .iter()
                                .all(|byte| byte.is_ascii_hexdigit())
                        {
                            return Err("bad unicode escape".into());
                        }
                        *i += 4;
                    }
                    _ => return Err("bad escape".into()),
                }
            }
            byte if byte < 0x20 => return Err("raw control in string".into()),
            _ => *i += 1,
        }
    }
    Err("unterminated string".into())
}

fn parse_number(source: &str, i: &mut usize, out: &mut String) -> Result<(), String> {
    let bytes = source.as_bytes();
    let start = *i;
    if bytes.get(*i) == Some(&b'-') {
        *i += 1;
    }
    if *i >= bytes.len() || !bytes[*i].is_ascii_digit() {
        return Err("bad number".into());
    }
    if bytes[*i] == b'0' {
        *i += 1;
    } else {
        while *i < bytes.len() && bytes[*i].is_ascii_digit() {
            *i += 1;
        }
    }
    if *i < bytes.len() && bytes[*i] == b'.' {
        *i += 1;
        let frac = *i;
        while *i < bytes.len() && bytes[*i].is_ascii_digit() {
            *i += 1;
        }
        if *i == frac {
            return Err("bad number".into());
        }
    }
    if *i < bytes.len() && (bytes[*i] == b'e' || bytes[*i] == b'E') {
        *i += 1;
        if *i < bytes.len() && (bytes[*i] == b'+' || bytes[*i] == b'-') {
            *i += 1;
        }
        let exp = *i;
        while *i < bytes.len() && bytes[*i].is_ascii_digit() {
            *i += 1;
        }
        if *i == exp {
            return Err("bad number".into());
        }
    }
    out.push_str(&source[start..*i]);
    Ok(())
}

fn parse_literal(
    source: &str,
    i: &mut usize,
    out: &mut String,
    literal: &str,
) -> Result<(), String> {
    let end = *i + literal.len();
    if source.len() < end || &source[*i..end] != literal {
        return Err("bad literal".into());
    }
    if end < source.len() {
        let next = source.as_bytes()[end];
        if next.is_ascii_alphanumeric() || next == b'_' {
            return Err("bad literal".into());
        }
    }
    out.push_str(literal);
    *i = end;
    Ok(())
}

fn expect(bytes: &[u8], i: &mut usize, byte: u8) -> Result<(), String> {
    if *i < bytes.len() && bytes[*i] == byte {
        *i += 1;
        Ok(())
    } else {
        Err("unexpected json token".into())
    }
}

fn skip_ws(bytes: &[u8], i: &mut usize) {
    while *i < bytes.len() && matches!(bytes[*i], b' ' | b'\n' | b'\r' | b'\t') {
        *i += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_json_assets() {
        assert!(is_json_asset("data/app.json"));
        assert!(!is_json_asset("data/app.json.bak"));
        assert!(!is_json_asset("json"));
    }

    #[test]
    fn emits_module_with_parse_key_order() {
        let module =
            json_module(r#" { "b" : 1, "a" : { "y": 2, "b": [true, null, "x"] } } "#).unwrap();
        assert_eq!(
            module,
            r#"export default {"b":1,"a":{"y":2,"b":[true,null,"x"]}};"#
        );
        assert_eq!(json_module("true").unwrap(), "export default true;");
        assert_eq!(json_module(r#""hi""#).unwrap(), r#"export default "hi";"#);
    }

    #[test]
    fn rejects_invalid_json_and_filters_export_names() {
        assert!(json_module("{").is_err());
        assert!(json_module("").is_err());
        assert!(named_json_exports("[1, 2,]").is_err());
        assert!(named_json_exports("[1, 2]").unwrap().is_empty());
        assert!(named_json_exports("null").unwrap().is_empty());
        assert_eq!(
            named_json_exports(r#"{"b":1,"A":2,"_c":3,"$d":4,"no-pe":5,"1x":6,"ok":7}"#).unwrap(),
            vec![
                "$d".to_string(),
                "A".to_string(),
                "_c".to_string(),
                "b".to_string(),
                "ok".to_string()
            ]
        );
    }
}
