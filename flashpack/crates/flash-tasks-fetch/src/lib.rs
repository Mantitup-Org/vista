#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlashFetchRequest {
    pub url: String,
    pub method: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlashHttpResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

pub fn request(method: &str, url: &str) -> Result<FlashFetchRequest, String> {
    let method = method.trim().to_ascii_uppercase();
    if !matches!(
        method.as_str(),
        "GET" | "POST" | "PUT" | "DELETE" | "HEAD"
    ) {
        return Err(format!("unsupported HTTP method '{method}'"));
    }
    if !url.contains("://") {
        return Err(format!("invalid URL '{url}': missing scheme separator"));
    }
    let host = url.split_once("://").map(|(_, rest)| rest).unwrap_or("");
    let host = host.split(['/', '?', '#']).next().unwrap_or("");
    if host.is_empty() {
        return Err(format!("invalid URL '{url}': empty host"));
    }
    Ok(FlashFetchRequest {
        url: url.to_string(),
        method,
    })
}

pub fn parse_http_response(bytes: &[u8]) -> Result<FlashHttpResponse, String> {
    let (head, body) = split_head_body(bytes).ok_or_else(|| {
        "invalid HTTP response: missing blank line after headers".to_string()
    })?;
    let head = String::from_utf8_lossy(head);
    let mut lines = head.split('\n').map(|line| line.trim_end_matches('\r'));
    let status_line = lines
        .next()
        .filter(|line| !line.is_empty())
        .ok_or_else(|| "invalid HTTP response: empty status line".to_string())?;
    let mut parts = status_line.split_whitespace();
    let version = parts.next().unwrap_or("");
    if !version.starts_with("HTTP/") {
        return Err(format!(
            "invalid HTTP response: bad status line '{status_line}'"
        ));
    }
    let code = parts.next().ok_or_else(|| {
        format!("invalid HTTP response: missing status code in '{status_line}'")
    })?;
    let status = code.parse::<u16>().map_err(|_| {
        format!("invalid HTTP response: bad status code '{code}'")
    })?;

    let mut headers = Vec::new();
    for line in lines {
        if line.is_empty() {
            continue;
        }
        let (name, value) = line.split_once(':').ok_or_else(|| {
            format!("invalid HTTP response: bad header '{line}'")
        })?;
        let name = name.trim().to_ascii_lowercase();
        if name.is_empty() {
            return Err(format!(
                "invalid HTTP response: empty header name in '{line}'"
            ));
        }
        headers.push((name, value.trim().to_string()));
    }

    Ok(FlashHttpResponse {
        status,
        headers,
        body: String::from_utf8_lossy(body).into_owned(),
    })
}

pub fn header<'a>(response: &'a FlashHttpResponse, name: &str) -> Option<&'a str> {
    let needle = name.to_ascii_lowercase();
    response
        .headers
        .iter()
        .find(|(key, _)| key == &needle)
        .map(|(_, value)| value.as_str())
}

fn split_head_body(bytes: &[u8]) -> Option<(&[u8], &[u8])> {
    let crlf = find_slice(bytes, b"\r\n\r\n");
    let lf = find_slice(bytes, b"\n\n");
    match (crlf, lf) {
        (Some(crlf), Some(lf)) if crlf <= lf => Some((&bytes[..crlf], &bytes[crlf + 4..])),
        (Some(crlf), None) => Some((&bytes[..crlf], &bytes[crlf + 4..])),
        (_, Some(lf)) => Some((&bytes[..lf], &bytes[lf + 2..])),
        (None, None) => None,
    }
}

fn find_slice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_requests_and_parses_responses() {
        let created = request("post", "https://example.com:443/v1?q=1").unwrap();
        assert_eq!(
            created,
            FlashFetchRequest {
                url: "https://example.com:443/v1?q=1".to_string(),
                method: "POST".to_string(),
            }
        );
        assert_eq!(request("head", "http://localhost/health").unwrap().method, "HEAD");

        let raw = b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nX-Request-Id: abc\r\nX-Request-Id: def\r\n\r\nhello";
        let response = parse_http_response(raw).unwrap();
        assert_eq!(response.status, 200);
        assert_eq!(response.body, "hello");
        assert_eq!(header(&response, "Content-Type"), Some("text/plain"));
        assert_eq!(header(&response, "x-request-id"), Some("abc"));
        assert_eq!(header(&response, "missing"), None);

        let mut lossy = b"HTTP/1.0 204\n\n".to_vec();
        lossy.push(0xff);
        let response = parse_http_response(&lossy).unwrap();
        assert_eq!(response.status, 204);
        assert!(response.body.contains('\u{FFFD}'));
    }

    #[test]
    fn rejects_bad_requests_and_malformed_responses() {
        let method = request("PATCH", "https://example.com").unwrap_err();
        assert!(method.contains("unsupported HTTP method"), "{method}");

        let scheme = request("GET", "example.com/path").unwrap_err();
        assert!(scheme.contains("missing scheme separator"), "{scheme}");

        let host = request("GET", "http:///missing-host").unwrap_err();
        assert!(host.contains("empty host"), "{host}");
        let bare = request("DELETE", "http://").unwrap_err();
        assert!(bare.contains("empty host"), "{bare}");

        let truncated = parse_http_response(b"HTTP/1.1 200 OK\r\nContent-Type: text/plain").unwrap_err();
        assert!(truncated.contains("missing blank line"), "{truncated}");

        let status = parse_http_response(b"NOT HTTP\r\n\r\n").unwrap_err();
        assert!(status.contains("bad status line"), "{status}");

        let code = parse_http_response(b"HTTP/1.1 OK\r\n\r\n").unwrap_err();
        assert!(code.contains("bad status code"), "{code}");
    }
}
