pub trait FlashPlugin {
    fn name(&self) -> &str;
    fn transform(&self, source: &str) -> String;
}

pub struct PluginRegistry {
    plugins: Vec<Box<dyn FlashPlugin>>,
}

impl PluginRegistry {
    pub fn new() -> Self {
        Self {
            plugins: Vec::new(),
        }
    }

    pub fn register(&mut self, plugin: Box<dyn FlashPlugin>) {
        self.plugins.push(plugin);
    }

    pub fn len(&self) -> usize {
        self.plugins.len()
    }

    pub fn run(&self, source: &str) -> String {
        let mut current = source.to_string();
        for plugin in &self.plugins {
            current = plugin.transform(&current);
        }
        current
    }
}

pub struct StripUseClient;

impl FlashPlugin for StripUseClient {
    fn name(&self) -> &str {
        "strip-use-client"
    }

    fn transform(&self, source: &str) -> String {
        for marker in ["\"use client\";", "'use client';"] {
            if let Some(rest) = source.strip_prefix(marker) {
                if rest.is_empty() {
                    return String::new();
                }
                if let Some(rest) = rest.strip_prefix("\r\n") {
                    return rest.to_string();
                }
                if let Some(rest) = rest.strip_prefix('\n') {
                    return rest.to_string();
                }
                if let Some(rest) = rest.strip_prefix('\r') {
                    return rest.to_string();
                }
                return source.to_string();
            }
        }
        source.to_string()
    }
}

pub struct ConstToLet;

impl FlashPlugin for ConstToLet {
    fn name(&self) -> &str {
        "const-to-let"
    }

    fn transform(&self, source: &str) -> String {
        let mut out = String::with_capacity(source.len());
        for line in source.split_inclusive('\n') {
            let (body, newline) = match line.strip_suffix('\n') {
                Some(body) => (body, "\n"),
                None => (line, ""),
            };
            if let Some(rest) = body.strip_prefix("const ") {
                out.push_str("let ");
                out.push_str(rest);
            } else {
                out.push_str(body);
            }
            out.push_str(newline);
        }
        out
    }
}

pub fn builtin_registry() -> PluginRegistry {
    let mut registry = PluginRegistry::new();
    registry.register(Box::new(StripUseClient));
    registry.register(Box::new(ConstToLet));
    registry
}

pub fn plugin_count() -> usize {
    builtin_registry().len()
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Append(&'static str);

    impl FlashPlugin for Append {
        fn name(&self) -> &str {
            self.0
        }

        fn transform(&self, source: &str) -> String {
            format!("{source}{}", self.0)
        }
    }

    #[test]
    fn builtins_run_in_registration_order() {
        assert_eq!(FlashPlugin::name(&StripUseClient), "strip-use-client");
        assert_eq!(FlashPlugin::name(&ConstToLet), "const-to-let");
        assert_eq!(plugin_count(), 2);
        assert_eq!(builtin_registry().len(), plugin_count());

        let source = "\"use client\";\nconst value = 1;\n  const indented = 2;\nkeep const inside;\n";
        let transformed = builtin_registry().run(source);
        assert_eq!(
            transformed,
            "let value = 1;\n  const indented = 2;\nkeep const inside;\n"
        );

        let single = "'use client';\r\nconst ready = true;";
        assert_eq!(
            builtin_registry().run(single),
            "let ready = true;"
        );
    }

    #[test]
    fn registry_applies_custom_plugins_in_order() {
        let mut registry = PluginRegistry::new();
        assert_eq!(registry.len(), 0);
        assert_eq!(registry.run("x"), "x");
        registry.register(Box::new(Append("A")));
        registry.register(Box::new(Append("B")));
        assert_eq!(registry.len(), 2);
        assert_eq!(registry.run("x"), "xAB");
    }

    #[test]
    fn builtins_leave_unrelated_source_unchanged() {
        let source = "\"use server\";\nconst inside = const ;\n\"use client\"; const sameLine = 1;\n";
        assert_eq!(FlashPlugin::transform(&StripUseClient, source), source);
        let consts = FlashPlugin::transform(&ConstToLet, "  const keep = 1;\nlet already = const ;\n");
        assert_eq!(consts, "  const keep = 1;\nlet already = const ;\n");
        assert_ne!(plugin_count(), 0);
    }
}
