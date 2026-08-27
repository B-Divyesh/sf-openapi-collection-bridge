mod export;
mod import;
pub mod model;

use anyhow::{bail, Context, Result};
use model::{finding, BridgeResult, Collection, Counts, Finding, FindingStatus, Format};
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

pub use export::export_collection;
pub use import::{detect_format, import_collection};

pub fn convert(
    input: &str,
    from: Option<Format>,
    to: Format,
    output: &Path,
    environment_files: &[PathBuf],
    include_secrets: bool,
) -> Result<(BridgeResult, Vec<Finding>)> {
    let source = from.or_else(|| detect_format(input)).context(
        "could not detect the source format; pass --from openapi|postman|insomnia|bruno|curl",
    )?;
    let (mut collection, mut findings) = import_collection(input, source)?;
    for env_file in environment_files {
        import::add_environment(&mut collection, env_file)?;
    }
    if include_secrets {
        findings.push(finding(
            FindingStatus::Preserved,
            "credentials",
            "Credential values included because --include-secrets was set.",
        ));
    } else {
        redact_credentials(&mut collection, &mut findings);
    }
    let mut export_findings = export_collection(&collection, to, output)?;
    findings.append(&mut export_findings);
    findings.sort_by(|a, b| {
        (&a.status, &a.feature, &a.detail).cmp(&(&b.status, &b.feature, &b.detail))
    });
    findings
        .dedup_by(|a, b| a.status == b.status && a.feature == b.feature && a.detail == b.detail);

    let report_path = report_path(output, to);
    let counts = make_counts(&collection, &findings);
    let report = render_report(&collection, source, to, &findings, &counts);
    fs::write(&report_path, report)
        .with_context(|| format!("failed to write {}", report_path.display()))?;
    Ok((
        BridgeResult {
            status: "converted".into(),
            source,
            target: to,
            output: output.display().to_string(),
            report: report_path.display().to_string(),
            counts,
        },
        findings,
    ))
}

pub fn inspect(input: &str, from: Option<Format>) -> Result<(Collection, Vec<Finding>)> {
    let source = from.or_else(|| detect_format(input)).context(
        "could not detect the source format; pass --from openapi|postman|insomnia|bruno|curl",
    )?;
    import_collection(input, source)
}

fn report_path(output: &Path, format: Format) -> PathBuf {
    if format == Format::Bruno {
        return output.join("bridge-report.md");
    }
    let mut name: OsString = output.as_os_str().to_owned();
    name.push(".bridge-report.md");
    PathBuf::from(name)
}

fn make_counts(collection: &Collection, findings: &[Finding]) -> Counts {
    Counts {
        requests: collection.requests.len(),
        environments: collection.environments.len(),
        preserved: findings
            .iter()
            .filter(|f| f.status == FindingStatus::Preserved)
            .count(),
        transformed: findings
            .iter()
            .filter(|f| f.status == FindingStatus::Transformed)
            .count(),
        unsupported: findings
            .iter()
            .filter(|f| f.status == FindingStatus::Unsupported)
            .count(),
    }
}

fn render_report(
    collection: &Collection,
    source: Format,
    target: Format,
    findings: &[Finding],
    counts: &Counts,
) -> String {
    let total = counts.preserved + counts.transformed + counts.unsupported;
    let represented = counts.preserved + counts.transformed;
    let coverage = if total == 0 {
        100.0
    } else {
        represented as f64 * 100.0 / total as f64
    };
    let mut out = format!(
        "# Bridge evidence: {}\n\n**{} → {}** · {} requests · {} environments · {:.1}% represented\n\n",
        collection.name, source, target, counts.requests, counts.environments, coverage
    );
    out.push_str("This deterministic report lists semantic outcomes; it does not execute requests or validate destination runtime behavior. Credentials are stripped unless explicitly included.\n\n");
    for (status, title, mark) in [
        (FindingStatus::Preserved, "Preserved", "✓"),
        (FindingStatus::Transformed, "Transformed", "↻"),
        (FindingStatus::Unsupported, "Unsupported", "×"),
    ] {
        out.push_str(&format!("## {}\n\n", title));
        let matching: Vec<_> = findings.iter().filter(|f| f.status == status).collect();
        if matching.is_empty() {
            out.push_str("- None.\n\n");
        } else {
            for item in matching {
                out.push_str(&format!(
                    "- {} **{}** — {}\n",
                    mark, item.feature, item.detail
                ));
            }
            out.push('\n');
        }
    }
    out
}

fn redact_credentials(collection: &mut Collection, findings: &mut Vec<Finding>) {
    for request in &mut collection.requests {
        if redact_url_query(&mut request.url) {
            findings.push(finding(
                FindingStatus::Transformed,
                format!("request '{}' credentials", request.name),
                "Sensitive URL query values were replaced with named placeholders.",
            ));
        }
        for pair in &mut request.query {
            if is_secret_key(&pair.name) && !pair.value.contains("{{") {
                pair.value = format!("{{{{bridge_secret_{}}}}}", slug(&pair.name));
                findings.push(finding(
                    FindingStatus::Transformed,
                    format!("request '{}' credentials", request.name),
                    format!(
                        "Sensitive query value '{}' replaced with a named placeholder.",
                        pair.name
                    ),
                ));
            }
        }
        for (key, value) in &mut request.headers {
            if is_secret_key(key) && !value.contains("{{") {
                *value = format!("{{{{bridge_secret_{}}}}}", slug(key));
                findings.push(finding(
                    FindingStatus::Transformed,
                    format!("request '{}' credentials", request.name),
                    format!(
                        "Sensitive header '{}' replaced with a named placeholder.",
                        key
                    ),
                ));
            }
        }
        if let Some(auth) = &mut request.auth {
            for (key, value) in &mut auth.fields {
                if is_auth_secret(&auth.kind, key) && !value.contains("{{") {
                    *value = format!("{{{{bridge_secret_{}}}}}", slug(key));
                    findings.push(finding(
                        FindingStatus::Transformed,
                        format!("request '{}' credentials", request.name),
                        format!(
                            "Authentication field '{}' replaced with a named placeholder.",
                            key
                        ),
                    ));
                }
            }
        }
        if let Some(body) = &mut request.body {
            if redact_json_text(&mut body.text) {
                findings.push(finding(
                    FindingStatus::Transformed,
                    format!("request '{}' credentials", request.name),
                    "Credential-shaped JSON body fields were replaced with named placeholders.",
                ));
            }
        }
        for example in &mut request.examples {
            if redact_json_text(&mut example.body) {
                findings.push(finding(
                    FindingStatus::Transformed,
                    format!("request '{}' example credentials", request.name),
                    "Credential-shaped response example fields were replaced with named placeholders.",
                ));
            }
        }
    }
    for env in &mut collection.environments {
        for (key, value) in &mut env.variables {
            if is_secret_key(key) && !value.contains("{{") {
                *value = format!("{{{{bridge_secret_{}}}}}", slug(key));
                findings.push(finding(
                    FindingStatus::Transformed,
                    format!("environment '{}' credentials", env.name),
                    format!("Variable '{}' replaced with a named placeholder.", key),
                ));
            }
        }
    }
    if findings.iter().all(|f| !f.feature.contains("credentials")) {
        findings.push(finding(
            FindingStatus::Preserved,
            "credential policy",
            "No literal credential-shaped values were found; safe placeholders remain unchanged.",
        ));
    }
}

fn is_secret_key(key: &str) -> bool {
    let key = key.to_ascii_lowercase().replace('-', "_");
    matches!(
        key.as_str(),
        "authorization"
            | "api_key"
            | "apikey"
            | "x_api_key"
            | "token"
            | "access_token"
            | "refresh_token"
            | "client_secret"
            | "secret"
            | "password"
            | "passwd"
            | "cookie"
            | "set_cookie"
            | "bearer"
    ) || ["_token", "_secret", "_password", "_key"]
        .iter()
        .any(|suffix| key.ends_with(suffix))
}

fn is_auth_secret(kind: &str, key: &str) -> bool {
    let kind = kind.to_ascii_lowercase();
    let key = key.to_ascii_lowercase().replace('-', "_");
    is_secret_key(&key)
        || (kind.contains("apikey") && key == "value")
        || (kind.contains("oauth")
            && matches!(
                key.as_str(),
                "accesstoken" | "refreshtoken" | "clientsecret"
            ))
        || (kind.contains("aws") && matches!(key.as_str(), "secretkey" | "sessiontoken"))
}

fn redact_url_query(url: &mut String) -> bool {
    let Some((base, query)) = url.split_once('?') else {
        return false;
    };
    let (query, fragment) = query
        .split_once('#')
        .map(|(q, f)| (q, Some(f)))
        .unwrap_or((query, None));
    let mut changed = false;
    let replaced = query
        .split('&')
        .map(|part| {
            let Some((key, value)) = part.split_once('=') else {
                return part.to_owned();
            };
            if is_secret_key(key) && !value.contains("{{") {
                changed = true;
                format!("{key}={{{{bridge_secret_{}}}}}", slug(key))
            } else {
                part.to_owned()
            }
        })
        .collect::<Vec<_>>()
        .join("&");
    if changed {
        *url = format!(
            "{base}?{replaced}{}",
            fragment.map(|f| format!("#{f}")).unwrap_or_default()
        );
    }
    changed
}

fn redact_json_text(text: &mut String) -> bool {
    let Ok(mut value) = serde_json::from_str::<serde_json::Value>(text) else {
        return false;
    };
    fn walk(value: &mut serde_json::Value) -> bool {
        let mut changed = false;
        match value {
            serde_json::Value::Object(map) => {
                for (key, value) in map {
                    if is_secret_key(key) && !value.as_str().is_some_and(|v| v.contains("{{")) {
                        *value = serde_json::Value::String(format!(
                            "{{{{bridge_secret_{}}}}}",
                            slug(key)
                        ));
                        changed = true;
                    } else {
                        changed |= walk(value);
                    }
                }
            }
            serde_json::Value::Array(items) => {
                for item in items {
                    changed |= walk(item);
                }
            }
            _ => {}
        }
        changed
    }
    let changed = walk(&mut value);
    if changed {
        *text = serde_json::to_string(&value).unwrap_or_default();
    }
    changed
}

pub(crate) fn slug(input: &str) -> String {
    let mut out = String::new();
    for c in input.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.ends_with('_') {
            out.push('_');
        }
    }
    out.trim_matches('_').to_owned()
}

pub(crate) fn ensure_parent(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    Ok(())
}

pub(crate) fn require_requests(collection: &Collection) -> Result<()> {
    if collection.requests.is_empty() {
        bail!("the source contains no requests to convert");
    }
    Ok(())
}
