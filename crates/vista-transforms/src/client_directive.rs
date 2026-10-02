//! Client Directive Transform
//! 
//! Detects `'use client'` directive at the top of files
//! and marks them as client components.

use rustc_hash::FxHashSet;
use serde::{Deserialize, Serialize};

/// Configuration for client directive detection
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ClientDirectiveConfig {
    /// The directive string to look for (default: "use client")
    pub directive: String,
}

impl ClientDirectiveConfig {
    pub fn new() -> Self {
        Self {
            directive: "use client".to_string(),
        }
    }
}

impl Default for ClientDirectiveConfig {
    fn default() -> Self {
        Self::new()
    }
}

/// Result of parsing a file for client directive
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ClientDirectiveResult {
    /// Whether the file has the client directive
    pub is_client: bool,
    /// The line number where directive was found (0 if not found)
    pub directive_line: usize,
    /// List of exported component names (populated by full parsing)
    pub exports: Vec<String>,
}

impl Default for ClientDirectiveResult {
    fn default() -> Self {
        Self {
            is_client: false,
            directive_line: 0,
            exports: Vec::new(),
        }
    }
}

/// Check if a source string contains the client directive
/// This is a fast string-based check without full parsing
pub fn has_client_directive(source: &str) -> bool {
    let trimmed = source.trim_start();
    
    // Check for string literal directive at the start
    if trimmed.starts_with("'use client'") || trimmed.starts_with("\"use client\"") {
        return true;
    }
    
    // Also check first significant line.
    // The directive is valid only when it is the first non-empty line.
    for line in source.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        return line.starts_with("'use client'") || line.starts_with("\"use client\"");
    }
    
    false
}

/// Quick check without full AST parsing
pub fn detect_client_directive_fast(source: &str) -> ClientDirectiveResult {
    let is_client = has_client_directive(source);
    let directive_line = if is_client {
        // Find the actual line number
        for (idx, line) in source.lines().enumerate() {
            let line = line.trim();
            if line.starts_with("'use client'") || line.starts_with("\"use client\"") {
                return ClientDirectiveResult {
                    is_client: true,
                    directive_line: idx + 1, // 1-indexed
                    exports: Vec::new(),
                };
            }
        }
        1
    } else {
        0
    };
    
    ClientDirectiveResult {
        is_client,
        directive_line,
        exports: Vec::new(),
    }
}

/// Scan a source file and extract information about exports
/// This uses simple regex-like matching, not full AST parsing
pub fn analyze_file(source: &str) -> ClientDirectiveResult {
    let mut result = detect_client_directive_fast(source);
    
    // Simple export detection using string matching
    let mut exports = FxHashSet::default();
    
    for line in source.lines() {
        let trimmed = line.trim();
        
        // export default function Name
        if trimmed.starts_with("export default function ") {
            if let Some(name) = trimmed
                .strip_prefix("export default function ")
                .and_then(|s| s.split(['(', ' ', '<']).next())
            {
                if !name.is_empty() {
                    exports.insert(name.to_string());
                }
            }
        }
        // export function Name
        else if trimmed.starts_with("export function ") {
            if let Some(name) = trimmed
                .strip_prefix("export function ")
                .and_then(|s| s.split(['(', ' ', '<']).next())
            {
                if !name.is_empty() {
                    exports.insert(name.to_string());
                }
            }
        }
        // export const Name
        else if trimmed.starts_with("export const ") {
            if let Some(name) = trimmed
                .strip_prefix("export const ")
                .and_then(|s| s.split(['=', ':', ' ']).next())
            {
                if !name.is_empty() {
                    exports.insert(name.to_string());
                }
            }
        }
    }
    
    result.exports = exports.into_iter().collect();
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_has_client_directive() {
        assert!(has_client_directive("'use client';\nexport default function() {}"));
        assert!(has_client_directive("\"use client\";\nexport default function() {}"));
        assert!(has_client_directive("  'use client'\n"));
        assert!(!has_client_directive("export default function() {}"));
        assert!(!has_client_directive("// comment\n'use client'")); // directive not on first significant line
    }

    #[test]
    fn test_detect_fast() {
        let result = detect_client_directive_fast("'use client';\n");
        assert!(result.is_client);
        assert_eq!(result.directive_line, 1);
        
        let result2 = detect_client_directive_fast("\n\n'use client'\n");
        assert!(result2.is_client);
        assert_eq!(result2.directive_line, 3);
    }
    
    #[test]
    fn test_analyze_exports() {
        let source = r#"
'use client';

export default function MyComponent() {
    return <div>Hello</div>;
}

export const helper = () => {};
export function utilFunc() {}
"#;
        let result = analyze_file(source);
        assert!(result.is_client);
        assert!(result.exports.contains(&"MyComponent".to_string()));
        assert!(result.exports.contains(&"helper".to_string()));
        assert!(result.exports.contains(&"utilFunc".to_string()));
    }
}
