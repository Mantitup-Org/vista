pub use flashpack_node::NodeLaunchOptions;

pub fn from_package_main(main: &str) -> NodeLaunchOptions {
    NodeLaunchOptions::new(main)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_package_main_launches_that_entry() {
        let options = from_package_main("dist/server.js");
        assert_eq!(options.entry, "dist/server.js");
        assert!(options.args.is_empty());
        assert_eq!(
            options.argv(),
            vec!["node".to_string(), "dist/server.js".to_string()]
        );
        assert_eq!(options.command_line(), "node dist/server.js");
    }

    #[test]
    fn from_package_main_quotes_paths_with_spaces() {
        let options = from_package_main("dist/my server.js");
        assert_eq!(options.command_line(), "node \"dist/my server.js\"");
        assert_eq!(options.argv()[1], "dist/my server.js");
    }

    #[test]
    fn from_package_main_keeps_empty_main() {
        let options = from_package_main("");
        assert_eq!(options.entry, "");
        assert!(options.args.is_empty());
        assert_eq!(options.command_line(), "node ");
    }
}
