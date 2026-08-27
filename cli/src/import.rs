use crate::model::*;
use anyhow::{bail, Context, Result};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::{Path, PathBuf};

pub fn detect_format(input: &str) -> Option<Format> {
    let path = Path::new(input);
    if path.is_dir() {
        return Some(Format::Bruno);
    }
    if path.is_file() {
        if path.extension().and_then(|x| x.to_str()) == Some("bru") {
            return Some(Format::Bruno);
        }
        if matches!(
            path.extension().and_then(|x| x.to_str()),
            Some("yaml" | "yml")
        ) {
            return Some(Format::Openapi);
        }
        let text = fs::read_to_string(path).ok()?;
        return detect_text(&text);
    }
    detect_text(input)
}

fn detect_text(text: &str) -> Option<Format> {
    let trimmed = text.trim_start();
    if trimmed.starts_with("curl ") || trimmed.starts_with("curl\n") {
        return Some(Format::Curl);
    }
    if trimmed.starts_with("meta {") {
        return Some(Format::Bruno);
    }
    let value: Value = serde_json::from_str(text).ok()?;
    if value.get("openapi").is_some() || value.get("swagger").is_some() {
        Some(Format::Openapi)
    } else if value.pointer("/info/schema").is_some() && value.get("item").is_some() {
        Some(Format::Postman)
    } else if value.get("_type").and_then(Value::as_str) == Some("export")
        || value.get("resources").is_some()
    {
        Some(Format::Insomnia)
    } else if value.get("values").is_some() && value.get("name").is_some() {
        Some(Format::Postman)
    } else {
        None
    }
}

pub fn import_collection(input: &str, format: Format) -> Result<(Collection, Vec<Finding>)> {
    match format {
        Format::Openapi => import_openapi(&read_text(input)?),
        Format::Postman => import_postman(&read_text(input)?),
        Format::Insomnia => import_insomnia(&read_text(input)?),
        Format::Bruno => import_bruno(Path::new(input)),
        Format::Curl => import_curl(&read_text_or_literal(input)),
    }
}

fn read_text(input: &str) -> Result<String> {
    fs::read_to_string(input).with_context(|| format!("failed to read source file '{input}'"))
}

fn read_text_or_literal(input: &str) -> String {
    fs::read_to_string(input).unwrap_or_else(|_| input.to_owned())
}

fn import_openapi(text: &str) -> Result<(Collection, Vec<Finding>)> {
    let doc: Value = if let Ok(json) = serde_json::from_str(text) {
        json
    } else {
        let yaml: serde_yaml::Value =
            serde_yaml::from_str(text).context("invalid OpenAPI JSON or YAML")?;
        serde_json::to_value(yaml)?
    };
    if doc.get("openapi").is_none() && doc.get("swagger").is_none() {
        bail!("document is not OpenAPI/Swagger");
    }
    let name = str_at(&doc, "/info/title")
        .unwrap_or("Imported OpenAPI")
        .to_owned();
    let base = doc
        .pointer("/servers/0/url")
        .and_then(Value::as_str)
        .unwrap_or("");
    let schemes = doc
        .pointer("/components/securitySchemes")
        .and_then(Value::as_object);
    let mut requests = vec![];
    let mut findings = vec![finding(
        FindingStatus::Preserved,
        "OpenAPI operations",
        "Path operations imported as named requests.",
    )];
    if let Some(paths) = doc.get("paths").and_then(Value::as_object) {
        for (path, path_item) in paths {
            let path_parameters = path_item
                .get("parameters")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            for method in [
                "get", "post", "put", "patch", "delete", "head", "options", "trace",
            ] {
                let Some(operation) = path_item.get(method) else {
                    continue;
                };
                let mut req = Request {
                    name: operation
                        .get("summary")
                        .or_else(|| operation.get("operationId"))
                        .and_then(Value::as_str)
                        .unwrap_or(&format!("{} {}", method.to_uppercase(), path))
                        .to_owned(),
                    method: method.to_uppercase(),
                    url: format!("{base}{path}"),
                    ..Default::default()
                };
                for parameter in path_parameters.iter().chain(
                    operation
                        .get("parameters")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten(),
                ) {
                    let Some(pname) = parameter.get("name").and_then(Value::as_str) else {
                        continue;
                    };
                    let value = parameter
                        .get("example")
                        .or_else(|| parameter.pointer("/schema/default"))
                        .map(value_text)
                        .unwrap_or_else(|| format!("{{{{{pname}}}}}"));
                    match parameter.get("in").and_then(Value::as_str) {
                        Some("query") => req.query.push(Pair {
                            name: pname.into(),
                            value,
                        }),
                        Some("header") => {
                            req.headers.insert(pname.into(), value);
                        }
                        _ => {}
                    }
                }
                if let Some(content) = operation
                    .pointer("/requestBody/content")
                    .and_then(Value::as_object)
                {
                    if let Some((mime, media)) = content.iter().next() {
                        let sample = media
                            .get("example")
                            .or_else(|| media.pointer("/schema/example"));
                        req.body = Some(Body {
                            mime: mime.clone(),
                            text: sample.map(value_text).unwrap_or_default(),
                        });
                    }
                }
                if let Some(responses) = operation.get("responses").and_then(Value::as_object) {
                    for (status, response) in responses {
                        let status = status.parse().unwrap_or(200);
                        if let Some(content) = response.get("content").and_then(Value::as_object) {
                            for media in content.values() {
                                if let Some(example) = media
                                    .get("example")
                                    .or_else(|| media.pointer("/examples/default/value"))
                                {
                                    req.examples.push(Example {
                                        name: format!("Response {status}"),
                                        status,
                                        body: value_text(example),
                                    });
                                    break;
                                }
                            }
                        }
                    }
                }
                let security = operation.get("security").or_else(|| doc.get("security"));
                if let Some(name) = security
                    .and_then(Value::as_array)
                    .and_then(|a| a.first())
                    .and_then(Value::as_object)
                    .and_then(|o| o.keys().next())
                {
                    if let Some(schema) = schemes.and_then(|s| s.get(name)) {
                        let kind = schema
                            .get("scheme")
                            .and_then(Value::as_str)
                            .or_else(|| schema.get("type").and_then(Value::as_str))
                            .unwrap_or("apiKey");
                        let mut fields = BTreeMap::new();
                        fields.insert(
                            "token".into(),
                            format!("{{{{bridge_secret_{}}}}}", crate::slug(name)),
                        );
                        req.auth = Some(Auth {
                            kind: kind.into(),
                            fields,
                        });
                    }
                }
                requests.push(req);
            }
        }
    }
    let mut environments = vec![];
    if let Some(servers) = doc.get("servers").and_then(Value::as_array) {
        for (index, server) in servers.iter().enumerate() {
            let mut variables = BTreeMap::new();
            variables.insert(
                "base_url".into(),
                server
                    .get("url")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .into(),
            );
            if let Some(vars) = server.get("variables").and_then(Value::as_object) {
                for (key, var) in vars {
                    variables.insert(
                        key.clone(),
                        var.get("default").map(value_text).unwrap_or_default(),
                    );
                }
            }
            environments.push(Environment {
                name: server
                    .get("description")
                    .and_then(Value::as_str)
                    .map(str::to_owned)
                    .unwrap_or_else(|| format!("Server {}", index + 1)),
                variables,
            });
        }
    }
    if requests.is_empty() {
        bail!("OpenAPI document contains no supported path operations");
    }
    if !environments.is_empty() {
        findings.push(finding(
            FindingStatus::Transformed,
            "OpenAPI servers",
            "Servers imported as named environments with base_url variables.",
        ));
    }
    Ok((
        Collection {
            name,
            source: Some(Format::Openapi),
            requests,
            environments,
        },
        findings,
    ))
}

fn import_postman(text: &str) -> Result<(Collection, Vec<Finding>)> {
    let doc: Value = serde_json::from_str(text).context("invalid Postman JSON")?;
    if doc.get("item").is_none() {
        bail!("Postman collection has no item array");
    }
    let name = str_at(&doc, "/info/name")
        .unwrap_or("Imported Postman collection")
        .to_owned();
    let mut requests = vec![];
    walk_postman(
        doc.get("item").and_then(Value::as_array).unwrap(),
        &[],
        None,
        &mut requests,
    );
    if requests.is_empty() {
        bail!("Postman collection contains no requests");
    }
    let mut environments = vec![];
    if let Some(vars) = doc.get("variable").and_then(Value::as_array) {
        environments.push(Environment {
            name: "Collection variables".into(),
            variables: postman_vars(vars),
        });
    }
    Ok((
        Collection {
            name,
            source: Some(Format::Postman),
            requests,
            environments,
        },
        vec![finding(
            FindingStatus::Preserved,
            "Postman requests",
            "Nested requests, headers, bodies, examples, auth, and scripts were inventoried.",
        )],
    ))
}

fn walk_postman(
    items: &[Value],
    folder: &[String],
    inherited_auth: Option<&Value>,
    output: &mut Vec<Request>,
) {
    for item in items {
        let name = item
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("Untitled");
        if let Some(children) = item.get("item").and_then(Value::as_array) {
            let mut nested = folder.to_vec();
            nested.push(name.into());
            walk_postman(
                children,
                &nested,
                item.get("auth").or(inherited_auth),
                output,
            );
            continue;
        }
        let Some(raw) = item.get("request") else {
            continue;
        };
        let request = if raw.is_string() {
            serde_json::json!({"url": raw})
        } else {
            raw.clone()
        };
        let url = request
            .get("url")
            .and_then(|v| {
                if v.is_string() {
                    v.as_str()
                } else {
                    v.get("raw").and_then(Value::as_str)
                }
            })
            .unwrap_or_default()
            .to_owned();
        let mut req = Request {
            name: name.into(),
            method: request
                .get("method")
                .and_then(Value::as_str)
                .unwrap_or("GET")
                .to_uppercase(),
            url,
            folder: folder.to_vec(),
            ..Default::default()
        };
        if let Some(headers) = request.get("header").and_then(Value::as_array) {
            for h in headers {
                if h.get("disabled").and_then(Value::as_bool) != Some(true) {
                    if let Some(k) = h.get("key").and_then(Value::as_str) {
                        req.headers
                            .insert(k.into(), h.get("value").map(value_text).unwrap_or_default());
                    }
                }
            }
        }
        if let Some(query) = request.pointer("/url/query").and_then(Value::as_array) {
            for q in query {
                if q.get("disabled").and_then(Value::as_bool) != Some(true) {
                    if let Some(k) = q.get("key").and_then(Value::as_str) {
                        req.query.push(Pair {
                            name: k.into(),
                            value: q.get("value").map(value_text).unwrap_or_default(),
                        });
                    }
                }
            }
        }
        if let Some(body) = request.get("body") {
            let mode = body.get("mode").and_then(Value::as_str).unwrap_or("raw");
            let text = if mode == "raw" {
                body.get("raw").map(value_text).unwrap_or_default()
            } else {
                value_text(body.get(mode).unwrap_or(&Value::Null))
            };
            let mime = body
                .pointer("/options/raw/language")
                .and_then(Value::as_str)
                .map(|x| {
                    if x == "json" {
                        "application/json"
                    } else {
                        "text/plain"
                    }
                })
                .unwrap_or("text/plain")
                .into();
            req.body = Some(Body { mime, text });
        }
        if let Some(auth) = request.get("auth").or(inherited_auth) {
            req.auth = parse_postman_auth(auth);
        }
        for event in item
            .get("event")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .chain(
                request
                    .get("event")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten(),
            )
        {
            let phase = event
                .get("listen")
                .and_then(Value::as_str)
                .unwrap_or("test")
                .to_owned();
            let code = event
                .pointer("/script/exec")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .unwrap_or_default();
            if !code.is_empty() {
                req.scripts.push(Script { phase, code });
            }
        }
        if let Some(responses) = item.get("response").and_then(Value::as_array) {
            for response in responses {
                req.examples.push(Example {
                    name: response
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or("Example")
                        .into(),
                    status: response.get("code").and_then(Value::as_u64).unwrap_or(200) as u16,
                    body: response.get("body").map(value_text).unwrap_or_default(),
                });
            }
        }
        output.push(req);
    }
}

fn parse_postman_auth(value: &Value) -> Option<Auth> {
    let kind = value.get("type")?.as_str()?.to_owned();
    if kind == "noauth" {
        return None;
    }
    let mut fields = BTreeMap::new();
    if let Some(parts) = value.get(&kind).and_then(Value::as_array) {
        for part in parts {
            if let Some(key) = part.get("key").and_then(Value::as_str) {
                fields.insert(
                    key.into(),
                    part.get("value").map(value_text).unwrap_or_default(),
                );
            }
        }
    }
    Some(Auth { kind, fields })
}

fn postman_vars(vars: &[Value]) -> BTreeMap<String, String> {
    vars.iter()
        .filter(|v| v.get("enabled").and_then(Value::as_bool) != Some(false))
        .filter_map(|v| {
            Some((
                v.get("key")?.as_str()?.into(),
                v.get("value").map(value_text).unwrap_or_default(),
            ))
        })
        .collect()
}

pub fn add_environment(collection: &mut Collection, path: &Path) -> Result<()> {
    let text = fs::read_to_string(path)
        .with_context(|| format!("failed to read environment {}", path.display()))?;
    let doc: Value = serde_json::from_str(&text).context("invalid Postman environment JSON")?;
    let values = doc
        .get("values")
        .and_then(Value::as_array)
        .context("environment has no values array")?;
    collection.environments.push(Environment {
        name: doc
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("Imported environment")
            .into(),
        variables: postman_vars(values),
    });
    Ok(())
}

fn import_insomnia(text: &str) -> Result<(Collection, Vec<Finding>)> {
    let doc: Value = serde_json::from_str(text).context("invalid Insomnia JSON")?;
    let resources = doc
        .get("resources")
        .and_then(Value::as_array)
        .context("Insomnia export has no resources array")?;
    let mut names = HashMap::new();
    for r in resources {
        if let (Some(id), Some(name)) = (
            r.get("_id").and_then(Value::as_str),
            r.get("name").and_then(Value::as_str),
        ) {
            names.insert(id.to_owned(), name.to_owned());
        }
    }
    let workspace = resources
        .iter()
        .find(|r| r.get("_type").and_then(Value::as_str) == Some("workspace"));
    let name = workspace
        .and_then(|r| r.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("Imported Insomnia collection")
        .to_owned();
    let mut requests = vec![];
    let mut environments = vec![];
    for r in resources {
        match r.get("_type").and_then(Value::as_str) {
            Some("request") => {
                let mut folder = vec![];
                let mut parent = r.get("parentId").and_then(Value::as_str);
                while let Some(id) = parent {
                    if let Some(n) = names.get(id) {
                        folder.insert(0, n.clone());
                    }
                    parent = resources
                        .iter()
                        .find(|x| x.get("_id").and_then(Value::as_str) == Some(id))
                        .and_then(|x| x.get("parentId"))
                        .and_then(Value::as_str);
                }
                if !folder.is_empty() && folder.first() == Some(&name) {
                    folder.remove(0);
                }
                let mut req = Request {
                    name: r
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or("Untitled")
                        .into(),
                    method: r
                        .get("method")
                        .and_then(Value::as_str)
                        .unwrap_or("GET")
                        .to_uppercase(),
                    url: r
                        .get("url")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .into(),
                    folder,
                    ..Default::default()
                };
                for h in r
                    .get("headers")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    if h.get("disabled").and_then(Value::as_bool) != Some(true) {
                        if let Some(k) = h.get("name").and_then(Value::as_str) {
                            req.headers.insert(
                                k.into(),
                                h.get("value").map(value_text).unwrap_or_default(),
                            );
                        }
                    }
                }
                for q in r
                    .get("parameters")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    if q.get("disabled").and_then(Value::as_bool) != Some(true) {
                        if let Some(k) = q.get("name").and_then(Value::as_str) {
                            req.query.push(Pair {
                                name: k.into(),
                                value: q.get("value").map(value_text).unwrap_or_default(),
                            });
                        }
                    }
                }
                if let Some(body) = r.get("body") {
                    let text = body
                        .get("text")
                        .or_else(|| body.get("params"))
                        .map(value_text)
                        .unwrap_or_default();
                    if !text.is_empty() {
                        req.body = Some(Body {
                            mime: body
                                .get("mimeType")
                                .and_then(Value::as_str)
                                .unwrap_or("text/plain")
                                .into(),
                            text,
                        });
                    }
                }
                if let Some(auth) = r.get("authentication").and_then(Value::as_object) {
                    let kind = auth.get("type").and_then(Value::as_str).unwrap_or("none");
                    if kind != "none" {
                        req.auth = Some(Auth {
                            kind: kind.into(),
                            fields: auth
                                .iter()
                                .filter(|(k, _)| *k != "type" && *k != "disabled")
                                .map(|(k, v)| (k.clone(), value_text(v)))
                                .collect(),
                        });
                    }
                }
                requests.push(req);
            }
            Some("environment") => {
                if let Some(data) = r.get("data").and_then(Value::as_object) {
                    environments.push(Environment {
                        name: r
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or("Environment")
                            .into(),
                        variables: data
                            .iter()
                            .map(|(k, v)| (k.clone(), value_text(v)))
                            .collect(),
                    });
                }
            }
            _ => {}
        }
    }
    if requests.is_empty() {
        bail!("Insomnia export contains no requests");
    }
    Ok((Collection { name, source: Some(Format::Insomnia), requests, environments }, vec![finding(FindingStatus::Preserved, "Insomnia resources", "Requests, groups, environments, auth, headers, query values, and bodies were inventoried.")]))
}

fn import_bruno(path: &Path) -> Result<(Collection, Vec<Finding>)> {
    let root = if path.is_dir() {
        path
    } else {
        path.parent().unwrap_or(Path::new("."))
    };
    let name = fs::read_to_string(root.join("bruno.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v.get("name").and_then(Value::as_str).map(str::to_owned))
        .unwrap_or_else(|| {
            root.file_name()
                .and_then(|x| x.to_str())
                .unwrap_or("Bruno collection")
                .into()
        });
    let mut files = if path.is_file() {
        vec![path.to_path_buf()]
    } else {
        vec![]
    };
    if path.is_dir() {
        collect_files(root, &mut files)?;
    }
    files.sort();
    let mut requests = vec![];
    let mut environments = vec![];
    for file in files {
        let text = fs::read_to_string(&file)?;
        let rel = file.strip_prefix(root).unwrap_or(&file);
        if rel.components().next().and_then(|c| c.as_os_str().to_str()) == Some("environments") {
            let vars = parse_key_values(
                block(&text, "vars")
                    .or_else(|| block(&text, "vars:secret"))
                    .unwrap_or_default(),
            );
            environments.push(Environment {
                name: file
                    .file_stem()
                    .and_then(|x| x.to_str())
                    .unwrap_or("Environment")
                    .into(),
                variables: vars,
            });
            continue;
        }
        let request_line = ["get", "post", "put", "patch", "delete", "head", "options"]
            .iter()
            .find_map(|method| block(&text, method).map(|b| ((*method).to_uppercase(), b)));
        let Some((method, request_block)) = request_line else {
            continue;
        };
        let url = request_block
            .lines()
            .map(str::trim)
            .find_map(|l| l.strip_prefix("url:"))
            .unwrap_or_default()
            .trim()
            .to_owned();
        let meta = block(&text, "meta").unwrap_or_default();
        let title = meta
            .lines()
            .map(str::trim)
            .find_map(|l| l.strip_prefix("name:"))
            .unwrap_or_else(|| {
                file.file_stem()
                    .and_then(|x| x.to_str())
                    .unwrap_or("Untitled")
            })
            .trim()
            .to_owned();
        let folder = rel
            .parent()
            .into_iter()
            .flat_map(Path::components)
            .filter_map(|c| c.as_os_str().to_str().map(str::to_owned))
            .collect();
        let mut req = Request {
            name: title,
            method,
            url,
            folder,
            headers: parse_key_values(block(&text, "headers").unwrap_or_default()),
            ..Default::default()
        };
        req.query = parse_key_values(block(&text, "query").unwrap_or_default())
            .into_iter()
            .map(|(name, value)| Pair { name, value })
            .collect();
        for label in ["body:json", "body:text", "body:xml", "body:graphql"] {
            if let Some(content) = block(&text, label) {
                req.body = Some(Body {
                    mime: if label == "body:json" {
                        "application/json"
                    } else {
                        "text/plain"
                    }
                    .into(),
                    text: content.trim().into(),
                });
                break;
            }
        }
        for (label, phase) in [("script:pre-request", "prerequest"), ("tests", "test")] {
            if let Some(code) = block(&text, label) {
                req.scripts.push(Script {
                    phase: phase.into(),
                    code: code.trim().into(),
                });
            }
        }
        for kind in ["bearer", "basic", "apikey"] {
            if let Some(content) = block(&text, &format!("auth:{kind}")) {
                req.auth = Some(Auth {
                    kind: kind.into(),
                    fields: parse_key_values(content),
                });
            }
        }
        requests.push(req);
    }
    if requests.is_empty() {
        bail!("Bruno source contains no .bru request files");
    }
    Ok((Collection { name, source: Some(Format::Bruno), requests, environments }, vec![finding(FindingStatus::Preserved, "Bruno requests", "Request files, folder paths, variables, bodies, auth, and script/test blocks were inventoried.")]))
}

fn collect_files(root: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
    for entry in fs::read_dir(root)
        .with_context(|| format!("failed to read Bruno directory {}", root.display()))?
    {
        let path = entry?.path();
        if path.is_dir() {
            collect_files(&path, out)?;
        } else if path.extension().and_then(|x| x.to_str()) == Some("bru") {
            out.push(path);
        }
    }
    Ok(())
}

fn block<'a>(text: &'a str, label: &str) -> Option<&'a str> {
    let needle = format!("{label} {{");
    let start = text.find(&needle)? + needle.len();
    let bytes = text.as_bytes();
    let mut depth = 1usize;
    for index in start..bytes.len() {
        match bytes[index] {
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&text[start..index]);
                }
            }
            _ => {}
        }
    }
    None
}

fn parse_key_values(text: &str) -> BTreeMap<String, String> {
    text.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let (k, v) = line.split_once(':')?;
            Some((k.trim().into(), v.trim().into()))
        })
        .collect()
}

fn import_curl(text: &str) -> Result<(Collection, Vec<Finding>)> {
    let tokens = shell_words::split(text.trim()).context("invalid cURL shell quoting")?;
    if tokens.first().map(String::as_str) != Some("curl") {
        bail!("cURL input must begin with 'curl'");
    }
    let mut req = Request {
        name: "Imported cURL request".into(),
        method: "GET".into(),
        ..Default::default()
    };
    let mut i = 1;
    while i < tokens.len() {
        match tokens[i].as_str() {
            "-X" | "--request" => {
                i += 1;
                req.method = tokens
                    .get(i)
                    .context("missing method after -X")?
                    .to_uppercase();
            }
            "-H" | "--header" => {
                i += 1;
                let h = tokens.get(i).context("missing header after -H")?;
                if let Some((k, v)) = h.split_once(':') {
                    req.headers.insert(k.trim().into(), v.trim().into());
                }
            }
            "-d" | "--data" | "--data-raw" | "--data-binary" => {
                i += 1;
                req.body = Some(Body {
                    mime: "application/json".into(),
                    text: tokens
                        .get(i)
                        .context("missing body after data flag")?
                        .clone(),
                });
                if req.method == "GET" {
                    req.method = "POST".into();
                }
            }
            "-u" | "--user" => {
                i += 1;
                let raw = tokens.get(i).context("missing credentials after -u")?;
                let (user, password) = raw.split_once(':').unwrap_or((raw, ""));
                req.auth = Some(Auth {
                    kind: "basic".into(),
                    fields: [
                        ("username".into(), user.into()),
                        ("password".into(), password.into()),
                    ]
                    .into_iter()
                    .collect(),
                });
            }
            "--url" => {
                i += 1;
                req.url = tokens.get(i).context("missing URL after --url")?.clone();
            }
            flag if flag.starts_with('-') => {}
            value
                if value.starts_with("http://")
                    || value.starts_with("https://")
                    || value.contains("{{") =>
            {
                req.url = value.into()
            }
            _ => {}
        }
        i += 1;
    }
    if req.url.is_empty() {
        bail!("cURL command contains no URL");
    }
    if let Some(content_type) = req
        .headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case("content-type"))
        .map(|(_, v)| v.clone())
    {
        if let Some(body) = &mut req.body {
            body.mime = content_type;
        }
    }
    Ok((Collection { name: "cURL import".into(), source: Some(Format::Curl), requests: vec![req], environments: vec![] }, vec![finding(FindingStatus::Preserved, "cURL request", "Method, URL, headers, auth, and request data were parsed without executing shell code."), finding(FindingStatus::Unsupported, "cURL transport flags", "Redirect, TLS, proxy, cookie-jar, and output-control flags are not collection semantics and are not imported.")]))
}

fn str_at<'a>(value: &'a Value, pointer: &str) -> Option<&'a str> {
    value.pointer(pointer).and_then(Value::as_str)
}
fn value_text(value: &Value) -> String {
    value.as_str().map(str::to_owned).unwrap_or_else(|| {
        if value.is_null() {
            String::new()
        } else {
            serde_json::to_string(value).unwrap_or_default()
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn curl_is_parsed_without_execution() {
        let (c, _) = import_curl("curl -X POST -H 'Authorization: Bearer secret' -d '{\"ok\":true}' https://example.test/a").unwrap();
        assert_eq!(c.requests[0].method, "POST");
        assert_eq!(c.requests[0].url, "https://example.test/a");
        assert_eq!(c.requests[0].body.as_ref().unwrap().text, "{\"ok\":true}");
    }

    #[test]
    fn openapi_yaml_imports_operations_and_servers() {
        let source = "openapi: 3.1.0\ninfo: {title: Pets, version: 1}\nservers:\n  - url: https://api.test\npaths:\n  /pets:\n    get:\n      summary: List pets\n      responses: {'200': {description: ok}}\n";
        let (c, _) = import_openapi(source).unwrap();
        assert_eq!(c.requests[0].url, "https://api.test/pets");
        assert_eq!(c.environments.len(), 1);
    }
}
