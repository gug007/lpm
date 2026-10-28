// The Search view's "files to include" and "files to exclude": comma lists of
// globs, matched against paths inside the project with gitignore's rules. A
// plain name or path also takes everything under it, so `src` means the folder.
use ignore::overrides::{Override, OverrideBuilder};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct SearchFilters {
    pub include: Vec<String>,
    pub exclude: Vec<String>,
}

/// Which field of the Search view is wrong, and why.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Invalid {
    pub field: &'static str,
    pub message: String,
}

impl Invalid {
    pub fn query(message: String) -> Self {
        Invalid {
            field: "query",
            message,
        }
    }
}

impl SearchFilters {
    fn is_empty(&self) -> bool {
        self.include
            .iter()
            .chain(&self.exclude)
            .all(|p| p.trim().is_empty())
    }

    /// Every glob as ripgrep's `--glob` takes it, excludes behind a `!`.
    pub fn globs(&self) -> Vec<String> {
        let include = self.include.iter().flat_map(|p| expand(p));
        let exclude = self
            .exclude
            .iter()
            .flat_map(|p| expand(p))
            .map(|g| format!("!{g}"));
        include.chain(exclude).collect()
    }

    /// The matcher for paths under `root`, or None when nothing narrows the
    /// search.
    pub fn matcher(&self, root: &Path) -> Result<Option<Override>, Invalid> {
        if self.is_empty() {
            return Ok(None);
        }
        let mut builder = OverrideBuilder::new(root);
        for (field, patterns, negate) in [
            ("include", &self.include, ""),
            ("exclude", &self.exclude, "!"),
        ] {
            for glob in patterns.iter().flat_map(|p| expand(p)) {
                builder
                    .add(&format!("{negate}{glob}"))
                    .map_err(|e| Invalid {
                        field,
                        message: e.to_string(),
                    })?;
            }
        }
        builder.build().map(Some).map_err(|e| Invalid {
            field: "include",
            message: e.to_string(),
        })
    }
}

/// Whether `path` (relative to the matcher's root) passes the filters.
pub fn keeps(filter: Option<&Override>, path: &str) -> bool {
    filter.is_none_or(|f| !f.matched(path, false).is_ignore())
}

fn expand(pattern: &str) -> Vec<String> {
    let mut p = pattern.trim();
    while let Some(rest) = p.strip_prefix("./") {
        p = rest;
    }
    let folder = p.ends_with('/');
    let p = p.trim_end_matches('/');
    if p.is_empty() {
        return Vec::new();
    }
    if p.contains(['*', '?', '[', '{']) && !folder {
        return vec![p.to_string()];
    }
    // gitignore anchors a pattern with a slash to the root; a bare name
    // matches at any depth.
    let under = if p.contains('/') {
        format!("{p}/**")
    } else {
        format!("**/{p}/**")
    };
    if folder {
        vec![under]
    } else {
        vec![p.to_string(), under]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn filters(include: &[&str], exclude: &[&str]) -> SearchFilters {
        SearchFilters {
            include: include.iter().map(|s| s.to_string()).collect(),
            exclude: exclude.iter().map(|s| s.to_string()).collect(),
        }
    }

    fn kept(f: &SearchFilters, paths: &[&'static str]) -> Vec<&'static str> {
        let matcher = f.matcher(Path::new("")).unwrap();
        paths
            .iter()
            .copied()
            .filter(|p| keeps(matcher.as_ref(), p))
            .collect()
    }

    const PATHS: &[&str] = &[
        "src/cart.ts",
        "src/cart.test.ts",
        "src/cart/index.ts",
        "docs/README.md",
        "app/src/main.rs",
        "fixtures/data.ts",
    ];

    #[test]
    fn globs_follow_gitignore_rules() {
        assert_eq!(
            kept(&filters(&["src/**/*.ts"], &[]), PATHS),
            ["src/cart.ts", "src/cart.test.ts", "src/cart/index.ts"]
        );
        assert_eq!(
            kept(&filters(&["*.ts"], &["*.test.ts", "fixtures"]), PATHS),
            ["src/cart.ts", "src/cart/index.ts"]
        );
    }

    #[test]
    fn a_plain_name_or_path_takes_the_folder() {
        assert_eq!(
            kept(&filters(&["src"], &[]), PATHS),
            [
                "src/cart.ts",
                "src/cart.test.ts",
                "src/cart/index.ts",
                "app/src/main.rs"
            ]
        );
        assert_eq!(
            kept(&filters(&["./src/cart/"], &[]), PATHS),
            ["src/cart/index.ts"]
        );
        assert_eq!(
            kept(&filters(&[], &["docs", " "]), PATHS),
            [
                "src/cart.ts",
                "src/cart.test.ts",
                "src/cart/index.ts",
                "app/src/main.rs",
                "fixtures/data.ts"
            ]
        );
    }

    #[test]
    fn nothing_typed_filters_nothing() {
        assert!(filters(&[" "], &[""])
            .matcher(Path::new(""))
            .unwrap()
            .is_none());
        assert_eq!(kept(&filters(&[], &[]), PATHS).len(), PATHS.len());
    }

    #[test]
    fn names_the_field_of_a_bad_glob() {
        let err = filters(&["*.ts"], &["src/[a"])
            .matcher(Path::new(""))
            .unwrap_err();
        assert_eq!(err.field, "exclude");
        assert!(err.message.contains("[a"), "{}", err.message);
    }

    #[test]
    fn hands_ripgrep_the_same_globs() {
        assert_eq!(
            filters(&["src", "*.ts"], &["*.test.ts"]).globs(),
            ["src", "**/src/**", "*.ts", "!*.test.ts"]
        );
    }
}
