use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FlashTraceRecord {
    pub category: String,
    pub detail: String,
}

pub fn group<'a>(records: &'a [FlashTraceRecord]) -> BTreeMap<&'a str, Vec<&'a str>> {
    let mut grouped: BTreeMap<&'a str, Vec<&'a str>> = BTreeMap::new();
    for record in records {
        grouped
            .entry(record.category.as_str())
            .or_default()
            .push(record.detail.as_str());
    }
    grouped
}

pub fn format_record(record: &FlashTraceRecord) -> String {
    format!("{}:{}", record.category, record.detail)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn groups_details_by_category_in_order() {
        let records = [
            FlashTraceRecord {
                category: "css".to_string(),
                detail: "parse".to_string(),
            },
            FlashTraceRecord {
                category: "resolve".to_string(),
                detail: "entry".to_string(),
            },
            FlashTraceRecord {
                category: "css".to_string(),
                detail: "minify".to_string(),
            },
        ];

        let grouped = group(&records);
        assert_eq!(
            grouped.keys().copied().collect::<Vec<_>>(),
            vec!["css", "resolve"]
        );
        assert_eq!(grouped["css"], vec!["parse", "minify"]);
        assert_eq!(grouped["resolve"], vec!["entry"]);
        assert!(group(&[]).is_empty());
    }

    #[test]
    fn formats_category_and_detail() {
        let record = FlashTraceRecord {
            category: "dev".to_string(),
            detail: "hmr".to_string(),
        };
        assert_eq!(format_record(&record), "dev:hmr");
    }
}
