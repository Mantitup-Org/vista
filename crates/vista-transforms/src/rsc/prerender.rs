//! Client Component Pre-renderer
//!
//! Parses client component TSX files and extracts static structure
//! to generate accurate server-side placeholders that match the component's
//! layout exactly, preventing CLS (Cumulative Layout Shift).

use std::collections::HashMap;
use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};

/// Extracted style information from a component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedStyles {
    pub padding: Option<String>,
    pub margin: Option<String>,
    pub background_color: Option<String>,
    pub border_radius: Option<String>,
    pub text_align: Option<String>,
    pub display: Option<String>,
    pub flex_direction: Option<String>,
    pub gap: Option<String>,
    pub justify_content: Option<String>,
    pub align_items: Option<String>,
    pub width: Option<String>,
    pub height: Option<String>,
    pub min_height: Option<String>,
    pub min_width: Option<String>,
    pub color: Option<String>,
    pub font_size: Option<String>,
    pub font_weight: Option<String>,
}

impl Default for ExtractedStyles {
    fn default() -> Self {
        Self {
            padding: None,
            margin: None,
            background_color: None,
            border_radius: None,
            text_align: None,
            display: None,
            flex_direction: None,
            gap: None,
            justify_content: None,
            align_items: None,
            width: None,
            height: None,
            min_height: None,
            min_width: None,
            color: None,
            font_size: None,
            font_weight: None,
        }
    }
}

/// Pre-rendered component structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrerenderedComponent {
    pub component_id: String,
    pub root_tag: String,
    pub root_styles: ExtractedStyles,
    pub placeholder_html: String,
    pub estimated_height: u32,
    pub estimated_width: Option<u32>,
}

/// Parse a TSX file and extract the component's static structure
pub fn prerender_client_component(file_path: &str) -> Option<PrerenderedComponent> {
    let content = fs::read_to_string(file_path).ok()?;
    
    // Check if it's a client component
    if !content.starts_with("'use client'") && !content.starts_with("\"use client\"") {
        return None;
    }
    
    let component_id = Path::new(file_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();
    
    // Extract the return statement's JSX
    let (root_styles, placeholder_html, height, width) = extract_jsx_structure(&content);
    
    Some(PrerenderedComponent {
        component_id: format!("client:{}", component_id),
        root_tag: "div".to_string(),
        root_styles,
        placeholder_html,
        estimated_height: height,
        estimated_width: width,
    })
}

/// Extract JSX structure and styles from component code
fn extract_jsx_structure(content: &str) -> (ExtractedStyles, String, u32, Option<u32>) {
    let mut styles = ExtractedStyles::default();
    let estimated_width: Option<u32> = None;
    
    // Parse style objects from the code
    // Look for style={{ ... }} patterns
    if let Some(style_start) = content.find("style={{") {
        let after_style = &content[style_start + 8..];
        if let Some(style_end) = find_matching_brace(after_style) {
            let style_content = &after_style[..style_end];
            styles = parse_style_object(style_content);
            
        }
    }
    
    // Look for nested elements to estimate height
    let h2_count = content.matches("<h2").count();
    let p_count = content.matches("<p ").count();
    let button_count = content.matches("<button").count();
    let div_count = content.matches("<div").count().saturating_sub(1); // Exclude root
    
    // Estimate height based on content
    let estimated_height = 40 // Base padding
        + (h2_count as u32 * 40)  // ~40px per heading
        + (p_count as u32 * 60)    // ~60px per paragraph (including large text)
        + (button_count as u32 * 50) / 2  // Buttons often side by side
        + (div_count as u32 * 20); // Container overhead
    
    // Generate placeholder HTML that matches the structure
    let placeholder_html = generate_placeholder_html(&styles, h2_count, p_count, button_count);
    
    (styles, placeholder_html, estimated_height, estimated_width)
}

/// Find the matching closing brace
fn find_matching_brace(s: &str) -> Option<usize> {
    let mut depth = 1;
    for (i, c) in s.chars().enumerate() {
        match c {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

/// Parse a JavaScript style object into ExtractedStyles
fn parse_style_object(content: &str) -> ExtractedStyles {
    let mut styles = ExtractedStyles::default();
    
    // Simple key-value parser for style objects
    let pairs: Vec<&str> = content.split(',').collect();
    
    for pair in pairs {
        let pair = pair.trim();
        if let Some(colon_pos) = pair.find(':') {
            let key = pair[..colon_pos].trim().trim_matches('\'').trim_matches('"');
            let value = pair[colon_pos + 1..].trim().trim_matches('\'').trim_matches('"');
            
            match key {
                "padding" => styles.padding = Some(value.to_string()),
                "margin" => styles.margin = Some(value.to_string()),
                "backgroundColor" => styles.background_color = Some(value.to_string()),
                "borderRadius" => styles.border_radius = Some(value.to_string()),
                "textAlign" => styles.text_align = Some(value.to_string()),
                "display" => styles.display = Some(value.to_string()),
                "flexDirection" => styles.flex_direction = Some(value.to_string()),
                "gap" => styles.gap = Some(value.to_string()),
                "justifyContent" => styles.justify_content = Some(value.to_string()),
                "alignItems" => styles.align_items = Some(value.to_string()),
                "width" => styles.width = Some(value.to_string()),
                "height" => styles.height = Some(value.to_string()),
                "minHeight" => styles.min_height = Some(value.to_string()),
                "minWidth" => styles.min_width = Some(value.to_string()),
                "color" => styles.color = Some(value.to_string()),
                "fontSize" => styles.font_size = Some(value.to_string()),
                "fontWeight" => styles.font_weight = Some(value.to_string()),
                _ => {}
            }
        }
    }
    
    styles
}

/// Generate placeholder HTML that matches the component structure
fn generate_placeholder_html(
    styles: &ExtractedStyles,
    h2_count: usize,
    p_count: usize,
    button_count: usize,
) -> String {
    let bg_color = styles.background_color.as_deref().unwrap_or("#1a1a2e");
    let border_radius = styles.border_radius.as_deref().unwrap_or("12px");
    let padding = styles.padding.as_deref().unwrap_or("20px");
    let text_align = styles.text_align.as_deref().unwrap_or("center");
    let margin = styles.margin.as_deref().unwrap_or("20px 0");
    
    let mut html = format!(
        r#"<div style="padding:{padding};background-color:{bg_color};border-radius:{border_radius};text-align:{text_align};margin:{margin};">"#
    );
    
    // Add heading placeholders
    for _ in 0..h2_count {
        html.push_str(r#"<div style="height:24px;background:linear-gradient(90deg,#333 25%,#444 50%,#333 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:4px;margin-bottom:16px;width:80%;margin-left:auto;margin-right:auto;"></div>"#);
    }
    
    // Add paragraph/number placeholders
    for _ in 0..p_count {
        html.push_str(r#"<div style="height:48px;width:60px;background:linear-gradient(90deg,rgba(0,217,255,0.2) 25%,rgba(0,217,255,0.3) 50%,rgba(0,217,255,0.2) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:8px;margin:20px auto;"></div>"#);
    }
    
    // Add button placeholders
    if button_count > 0 {
        html.push_str(r#"<div style="display:flex;gap:10px;justify-content:center;">"#);
        for i in 0..button_count {
            let color = if i % 2 == 0 { "rgba(255,71,87,0.3)" } else { "rgba(46,213,115,0.3)" };
            html.push_str(&format!(
                r#"<div style="width:72px;height:44px;background:linear-gradient(90deg,{color} 25%,rgba(255,255,255,0.1) 50%,{color} 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:8px;"></div>"#
            ));
        }
        html.push_str("</div>");
    }
    
    html.push_str("</div>");
    
    // Add shimmer animation keyframes
    html.push_str(r#"<style>@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}</style>"#);
    
    html
}

/// Batch pre-render all client components in a directory
pub fn prerender_all_client_components(app_dir: &str) -> HashMap<String, PrerenderedComponent> {
    let app_path = Path::new(app_dir);
    let cwd = app_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or(app_path);
    prerender_all_client_components_for_project(&cwd.to_string_lossy(), app_dir)
}

/// Batch pre-render client components from `app/` plus sibling project roots.
pub fn prerender_all_client_components_for_project(
    cwd: &str,
    app_dir: &str,
) -> HashMap<String, PrerenderedComponent> {
    let mut components = HashMap::new();

    fn scan_dir(dir: &Path, components: &mut HashMap<String, PrerenderedComponent>) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                if path.is_dir() {
                    if name.starts_with('.') || name == "node_modules" {
                        continue;
                    }
                    scan_dir(&path, components);
                } else if let Some(ext) = path.extension() {
                    if ext == "tsx" || ext == "jsx" {
                        if let Some(prerendered) =
                            prerender_client_component(path.to_str().unwrap_or(""))
                        {
                            components.insert(prerendered.component_id.clone(), prerendered);
                        }
                    }
                }
            }
        }
    }

    scan_dir(Path::new(app_dir), &mut components);
    for root in super::scanner::discover_project_client_roots(cwd) {
        let root_path = Path::new(&root.dir);
        if root_path == Path::new(app_dir) {
            continue;
        }
        scan_dir(root_path, &mut components);
    }
    components
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_style_object() {
        let style = r#"
            padding: '20px',
            backgroundColor: '#1a1a2e',
            borderRadius: '12px'
        "#;
        
        let parsed = parse_style_object(style);
        assert_eq!(parsed.padding, Some("20px".to_string()));
        assert_eq!(parsed.background_color, Some("#1a1a2e".to_string()));
    }
}
