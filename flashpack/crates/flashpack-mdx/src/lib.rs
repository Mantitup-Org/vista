#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompiledMarkdown {
    pub frontmatter: Vec<(String, String)>,
    pub headings: Vec<(u8, String)>,
    pub html: String,
}

pub fn supported_extensions() -> &'static [&'static str] {
    &["md", "mdx"]
}

pub fn compile_markdown(source: &str) -> CompiledMarkdown {
    let source = source.replace("\r\n", "\n").replace('\r', "\n");
    let (frontmatter, body) = split_frontmatter(&source);
    let lines: Vec<&str> = body.split('\n').collect();
    let mut headings = Vec::new();
    let mut blocks = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        if lines[i].trim().is_empty() {
            i += 1;
            continue;
        }
        if let Some(ticks) = opening_fence(lines[i]) {
            i += 1;
            let mut code = Vec::new();
            while i < lines.len() && !closing_fence(lines[i], ticks) {
                code.push(lines[i]);
                i += 1;
            }
            if i < lines.len() {
                i += 1;
            }
            blocks.push(format!(
                "<pre><code>{}</code></pre>",
                escape_html(&code.join("\n"))
            ));
            continue;
        }
        if let Some((level, text)) = parse_atx(lines[i]) {
            headings.push((level, text.clone()));
            blocks.push(format!("<h{level}>{}</h{level}>", render_inline(&text)));
            i += 1;
            continue;
        }
        let mut paragraph = vec![lines[i]];
        i += 1;
        while i < lines.len()
            && !lines[i].trim().is_empty()
            && opening_fence(lines[i]).is_none()
            && parse_atx(lines[i]).is_none()
        {
            paragraph.push(lines[i]);
            i += 1;
        }
        blocks.push(format!("<p>{}</p>", render_inline(&paragraph.join("\n"))));
    }
    CompiledMarkdown {
        frontmatter,
        headings,
        html: blocks.join("\n"),
    }
}

fn split_frontmatter(source: &str) -> (Vec<(String, String)>, String) {
    let lines: Vec<&str> = source.split('\n').collect();
    if lines.first().copied() != Some("---") {
        return (Vec::new(), source.to_string());
    }
    let end = lines.iter().skip(1).position(|line| *line == "---");
    let Some(end) = end else {
        return (Vec::new(), source.to_string());
    };
    let end = end + 1;
    let mut frontmatter = Vec::new();
    for line in &lines[1..end] {
        if line.trim().is_empty() {
            continue;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let key = key.trim();
        if key.is_empty() {
            continue;
        }
        frontmatter.push((key.to_string(), value.trim().to_string()));
    }
    (frontmatter, lines[end + 1..].join("\n"))
}

fn opening_fence(line: &str) -> Option<usize> {
    let trimmed = line.trim();
    let ticks = trimmed.chars().take_while(|ch| *ch == '`').count();
    if ticks >= 3 {
        Some(ticks)
    } else {
        None
    }
}

fn closing_fence(line: &str, open: usize) -> bool {
    let trimmed = line.trim();
    trimmed.len() >= open && trimmed.chars().all(|ch| ch == '`')
}

fn parse_atx(line: &str) -> Option<(u8, String)> {
    let mut rest = line.trim_end();
    let mut leading = 0;
    while rest.starts_with(' ') && leading < 3 {
        rest = &rest[1..];
        leading += 1;
    }
    if rest.starts_with([' ', '\t']) || !rest.starts_with('#') {
        return None;
    }
    let hashes = rest.chars().take_while(|ch| *ch == '#').count();
    if !(1..=6).contains(&hashes) {
        return None;
    }
    let after = &rest[hashes..];
    if !after.is_empty() && !after.starts_with([' ', '\t']) {
        return None;
    }
    Some((hashes as u8, strip_closing_hashes(after.trim()).to_string()))
}

fn strip_closing_hashes(text: &str) -> &str {
    let trimmed = text.trim_end();
    let core = trimmed.trim_end_matches('#');
    if core.len() != trimmed.len() && (core.is_empty() || core.ends_with(' ')) {
        core.trim_end()
    } else {
        text.trim()
    }
}

fn render_inline(input: &str) -> String {
    let mut out = String::new();
    let mut rest = input;
    while !rest.is_empty() {
        if let Some(inner) = rest.strip_prefix('`') {
            if let Some(end) = inner.find('`') {
                out.push_str("<code>");
                out.push_str(&escape_html(&inner[..end]));
                out.push_str("</code>");
                rest = &inner[end + 1..];
                continue;
            }
        }
        if let Some((text, href, consumed)) = link_parts(rest) {
            if href.contains('"') || href.contains('\'') {
                out.push_str(&escape_html(&rest[..consumed]));
            } else {
                out.push_str("<a href=\"");
                out.push_str(&escape_html(href));
                out.push_str("\">");
                out.push_str(&render_inline(text));
                out.push_str("</a>");
            }
            rest = &rest[consumed..];
            continue;
        }
        if rest.starts_with("**") {
            if let Some(end) = find_delim(&rest[2..], "**") {
                out.push_str("<strong>");
                out.push_str(&render_inline(&rest[2..2 + end]));
                out.push_str("</strong>");
                rest = &rest[2 + end + 2..];
                continue;
            }
        }
        if rest.starts_with('*') && !rest[1..].starts_with('*') {
            if let Some(end) = find_em_close(&rest[1..]) {
                out.push_str("<em>");
                out.push_str(&render_inline(&rest[1..1 + end]));
                out.push_str("</em>");
                rest = &rest[1 + end + 1..];
                continue;
            }
        }
        let ch = rest.chars().next().unwrap();
        push_escaped(&mut out, ch);
        rest = &rest[ch.len_utf8()..];
    }
    out
}

fn link_parts(s: &str) -> Option<(&str, &str, usize)> {
    if !s.starts_with('[') {
        return None;
    }
    let close = s.find("](")?;
    let after = &s[close + 2..];
    let end = after.find(')')?;
    let text = &s[1..close];
    let href = &after[..end];
    Some((text, href, close + 2 + end + 1))
}

fn find_delim(s: &str, delim: &str) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'`' {
            if let Some(rel) = s[i + 1..].find('`') {
                i += 1 + rel + 1;
                continue;
            }
        }
        if s[i..].starts_with(delim) {
            return Some(i);
        }
        i += s[i..].chars().next().unwrap().len_utf8();
    }
    None
}

fn find_em_close(s: &str) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'`' {
            if let Some(rel) = s[i + 1..].find('`') {
                i += 1 + rel + 1;
                continue;
            }
        }
        if bytes[i] == b'*' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            if let Some(rel) = s[i + 2..].find("**") {
                i += 2 + rel + 2;
                continue;
            }
        }
        if bytes[i] == b'[' {
            if let Some((_, _, len)) = link_parts(&s[i..]) {
                i += len;
                continue;
            }
        }
        if bytes[i] == b'*' {
            return Some(i);
        }
        i += s[i..].chars().next().unwrap().len_utf8();
    }
    None
}

fn escape_html(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for ch in text.chars() {
        push_escaped(&mut out, ch);
    }
    out
}

fn push_escaped(out: &mut String, ch: char) {
    match ch {
        '&' => out.push_str("&amp;"),
        '<' => out.push_str("&lt;"),
        '>' => out.push_str("&gt;"),
        _ => out.push(ch),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_supported_extensions() {
        assert_eq!(supported_extensions(), &["md", "mdx"]);
    }

    #[test]
    fn compiles_frontmatter_blocks_and_inline_markup() {
        let source = "---\r\ntitle: Hello\nsite: https://example.com\n---\n# Title\n\nA *em* and **bold** and `code` and [link](https://ex.com).\n\n```\n<a>\n```\n\n###### Small ##\n";
        let doc = compile_markdown(source);
        assert_eq!(
            doc.frontmatter,
            vec![
                ("title".to_string(), "Hello".to_string()),
                ("site".to_string(), "https://example.com".to_string())
            ]
        );
        assert_eq!(
            doc.headings,
            vec![(1, "Title".to_string()), (6, "Small".to_string())]
        );
        assert_eq!(
            doc.html,
            "<h1>Title</h1>\n<p>A <em>em</em> and <strong>bold</strong> and <code>code</code> and <a href=\"https://ex.com\">link</a>.</p>\n<pre><code>&lt;a&gt;</code></pre>\n<h6>Small</h6>"
        );
        assert_ne!(doc.html, source);
    }

    #[test]
    fn escapes_text_and_refuses_quoted_hrefs() {
        let doc = compile_markdown(
            "Fish & chips <script>\n\nSee [a](bad\"url) please\n\n####### no\n\n#Nope\n",
        );
        assert!(doc.frontmatter.is_empty());
        assert!(doc.headings.is_empty());
        assert_eq!(
            doc.html,
            "<p>Fish &amp; chips &lt;script&gt;</p>\n<p>See [a](bad\"url) please</p>\n<p>####### no</p>\n<p>#Nope</p>"
        );
    }

    #[test]
    fn unclosed_frontmatter_and_fence_stay_inert() {
        let open = compile_markdown("---\ntitle: Hi\n# Nope\n");
        assert!(open.frontmatter.is_empty());
        assert_eq!(open.headings, vec![(1, "Nope".to_string())]);
        assert!(open.html.contains("<h1>Nope</h1>"));
        assert!(open.html.contains("<p>---\ntitle: Hi</p>"));

        let fence = compile_markdown("```\n# not heading\n**no**\n<script>\n");
        assert!(fence.headings.is_empty());
        assert_eq!(
            fence.html,
            "<pre><code># not heading\n**no**\n&lt;script&gt;\n</code></pre>"
        );
        assert!(!fence.html.contains("<script>"));
        assert!(!fence.html.contains("<h1>"));
    }

    #[test]
    fn escapes_markup_inside_link_hrefs() {
        let doc = compile_markdown("[a](http://x.com/?q=<script>&x=1)\n");
        assert_eq!(
            doc.html,
            "<p><a href=\"http://x.com/?q=&lt;script&gt;&amp;x=1\">a</a></p>"
        );
    }
}
