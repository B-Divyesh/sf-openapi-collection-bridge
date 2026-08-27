use crate::model::*;
use crate::{ensure_parent, require_requests, slug};
use anyhow::{Context, Result};
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

pub fn export_collection(
    collection: &Collection,
    format: Format,
    output: &Path,
) -> Result<Vec<Finding>> {
    require_requests(collection)?;
    match format {
        Format::Openapi => export_openapi(collection, output),
        Format::Postman => export_postman(collection, output),
        Format::Insomnia => export_insomnia(collection, output),
        Format::Bruno => export_bruno(collection, output),
        Format::Curl => export_curl(collection, output),
    }
}

fn export_openapi(collection: &Collection, output: &Path) -> Result<Vec<Finding>> {
    let mut paths = Map::new();
    let mut findings = vec![finding(FindingStatus::Preserved, "requests", "Request methods, paths, headers, query values, and bodies were represented as OpenAPI operations.")];
    for request in &collection.requests {
        let path = url_path(&request.url);
        let mut parameters = vec![];
        for pair in &request.query {
            parameters.push(json!({"in":"query", "name":pair.name, "schema":{"type":"string", "default":pair.value}}));
        }
        for (name, value) in &request.headers {
            parameters.push(
                json!({"in":"header", "name":name, "schema":{"type":"string", "default":value}}),
            );
        }
        let mut operation = json!({
            "operationId": format!("{}_{}", slug(&request.name), &stable_id(&format!("{}{}", request.method, request.url))[..8]),
            "summary": request.name,
            "parameters": parameters,
            "responses": {"200":{"description":"Imported response"}}
        });
        if let Some(body) = &request.body {
            operation.as_object_mut().unwrap().insert("requestBody".into(), json!({"content":{body.mime.clone(): {"example": parse_json_or_string(&body.text)}}}));
        }
        if !request.examples.is_empty() {
            let mut responses = Map::new();
            for example in &request.examples {
                responses.insert(example.status.to_string(), json!({"description":example.name, "content":{"application/json":{"example":parse_json_or_string(&example.body)}}}));
            }
            operation
                .as_object_mut()
                .unwrap()
                .insert("responses".into(), Value::Object(responses));
            findings.push(finding(
                FindingStatus::Transformed,
                "response examples",
                "Named examples became OpenAPI response examples grouped by status.",
            ));
        }
        if request.auth.is_some() {
            operation
                .as_object_mut()
                .unwrap()
                .insert("security".into(), json!([{"bridgeAuth":[]} ]));
            findings.push(finding(
                FindingStatus::Transformed,
                "authentication",
                "Client authentication became an OpenAPI bridgeAuth security requirement.",
            ));
        }
        if !request.scripts.is_empty() {
            findings.push(finding(
                FindingStatus::Unsupported,
                "request scripts/tests",
                format!(
                    "OpenAPI cannot represent {} script block(s) on '{}'.",
                    request.scripts.len(),
                    request.name
                ),
            ));
        }
        let entry = paths
            .entry(path)
            .or_insert_with(|| Value::Object(Map::new()));
        entry
            .as_object_mut()
            .unwrap()
            .insert(request.method.to_ascii_lowercase(), operation);
    }
    let servers: Vec<_> = collection
        .environments
        .iter()
        .map(|env| {
            let url = env
                .variables
                .get("base_url")
                .cloned()
                .unwrap_or_else(|| "{{base_url}}".into());
            let variables: BTreeMap<_, _> = env
                .variables
                .iter()
                .filter(|(k, _)| k.as_str() != "base_url")
                .map(|(k, v)| (k.clone(), json!({"default":v})))
                .collect();
            json!({"url":url, "description":env.name, "variables":variables})
        })
        .collect();
    if !collection.environments.is_empty() {
        findings.push(finding(
            FindingStatus::Transformed,
            "environments",
            "Named environments became OpenAPI server entries and server variables.",
        ));
    }
    let doc = json!({
        "openapi":"3.1.0",
        "info":{"title":collection.name, "version":"1.0.0", "x-generated-by":"openapi-collection-bridge/0.1.0"},
        "servers":servers,
        "paths":paths,
        "components":{"securitySchemes":{"bridgeAuth":{"type":"http", "scheme":"bearer"}}}
    });
    write_json(output, &doc)?;
    Ok(findings)
}

fn export_postman(collection: &Collection, output: &Path) -> Result<Vec<Finding>> {
    let mut items = vec![];
    for request in &collection.requests {
        let headers: Vec<_> = request
            .headers
            .iter()
            .map(|(key, value)| json!({"key":key,"value":value,"type":"text"}))
            .collect();
        let query: Vec<_> = request
            .query
            .iter()
            .map(|p| json!({"key":p.name,"value":p.value}))
            .collect();
        let auth = request
            .auth
            .as_ref()
            .map(postman_auth)
            .unwrap_or_else(|| json!({"type":"noauth"}));
        let mut raw_url = request.url.clone();
        if !query.is_empty() && !raw_url.contains('?') {
            raw_url.push('?');
            raw_url.push_str(
                &request
                    .query
                    .iter()
                    .map(|p| format!("{}={}", p.name, p.value))
                    .collect::<Vec<_>>()
                    .join("&"),
            );
        }
        let body = request.body.as_ref().map(|b| json!({"mode":"raw", "raw":b.text, "options":{"raw":{"language":if b.mime.contains("json") {"json"} else {"text"}}}}));
        let events: Vec<_> = request.scripts.iter().map(|s| json!({"listen":if s.phase.contains("pre") {"prerequest"} else {"test"}, "script":{"type":"text/javascript","exec":s.code.lines().collect::<Vec<_>>()}})).collect();
        let responses: Vec<_> = request.examples.iter().map(|e| json!({"name":e.name,"code":e.status,"status":"Imported example","body":e.body,"header":[]})).collect();
        items.push(json!({"name":request.name,"request":{"method":request.method,"header":headers,"body":body,"url":{"raw":raw_url,"query":query},"auth":auth},"event":events,"response":responses}));
    }
    let variables: Vec<_> = collection
        .environments
        .first()
        .into_iter()
        .flat_map(|e| &e.variables)
        .map(|(key, value)| json!({"key":key,"value":value}))
        .collect();
    let doc = json!({"info":{"name":collection.name,"schema":"https://schema.getpostman.com/json/collection/v2.1.0/collection.json","description":"Generated by OpenAPI Collection Bridge"},"item":items,"variable":variables});
    write_json(output, &doc)?;
    let mut findings = vec![finding(FindingStatus::Preserved, "requests", "Requests, headers, query values, bodies, auth, examples, and JavaScript script blocks were emitted as Postman 2.1.")];
    if !collection.environments.is_empty() {
        let parent = output.parent().unwrap_or(Path::new("."));
        let stem = output
            .file_stem()
            .and_then(|part| part.to_str())
            .unwrap_or("collection");
        for env in &collection.environments {
            let values: Vec<_> = env
                .variables
                .iter()
                .map(
                    |(key, value)| json!({"key":key,"value":value,"enabled":true,"type":"default"}),
                )
                .collect();
            let env_doc = json!({
                "id": stable_id(&format!("{}:{}", collection.name, env.name)),
                "name": env.name,
                "values": values,
                "_postman_variable_scope": "environment",
                "_postman_exported_using": "OpenAPI Collection Bridge 0.1.0"
            });
            write_json(
                &parent.join(format!(
                    "{}.{}.postman_environment.json",
                    stem,
                    safe_name(&env.name)
                )),
                &env_doc,
            )?;
        }
        findings.push(finding(
            FindingStatus::Transformed,
            "environments",
            format!(
                "All {} named environment(s) were written as separate Postman environment files; the first is also available as collection variables.",
                collection.environments.len()
            ),
        ));
    }
    Ok(findings)
}

fn postman_auth(auth: &Auth) -> Value {
    let values: Vec<_> = auth
        .fields
        .iter()
        .map(|(key, value)| json!({"key":key,"value":value,"type":"string"}))
        .collect();
    json!({"type":auth.kind, auth.kind.clone():values})
}

fn export_insomnia(collection: &Collection, output: &Path) -> Result<Vec<Finding>> {
    let workspace_id = format!("wrk_{}", &stable_id(&collection.name)[..12]);
    let mut resources = vec![
        json!({"_id":workspace_id,"_type":"workspace","name":collection.name,"description":"Generated by OpenAPI Collection Bridge","scope":"collection"}),
    ];
    let mut groups: BTreeMap<Vec<String>, String> = BTreeMap::new();
    for request in &collection.requests {
        let mut parent = workspace_id.clone();
        for depth in 0..request.folder.len() {
            let path = request.folder[..=depth].to_vec();
            let id = groups
                .entry(path.clone())
                .or_insert_with(|| format!("fld_{}", &stable_id(&path.join("/"))[..12]))
                .clone();
            if !resources
                .iter()
                .any(|r| r.get("_id").and_then(Value::as_str) == Some(&id))
            {
                resources.push(json!({"_id":id,"_type":"request_group","parentId":parent,"name":request.folder[depth]}));
            }
            parent = id;
        }
        let headers: Vec<_> = request
            .headers
            .iter()
            .map(|(name, value)| json!({"name":name,"value":value}))
            .collect();
        let parameters: Vec<_> = request
            .query
            .iter()
            .map(|p| json!({"name":p.name,"value":p.value}))
            .collect();
        let body = request
            .body
            .as_ref()
            .map(|b| json!({"mimeType":b.mime,"text":b.text}))
            .unwrap_or_else(|| json!({}));
        let authentication = request
            .auth
            .as_ref()
            .map(|a| {
                let mut value = serde_json::to_value(&a.fields).unwrap();
                value
                    .as_object_mut()
                    .unwrap()
                    .insert("type".into(), json!(a.kind));
                value
            })
            .unwrap_or_else(|| json!({"type":"none"}));
        resources.push(json!({"_id":format!("req_{}", &stable_id(&format!("{}{}", request.method, request.url))[..12]),"_type":"request","parentId":parent,"name":request.name,"method":request.method,"url":request.url,"headers":headers,"parameters":parameters,"body":body,"authentication":authentication}));
    }
    for env in &collection.environments {
        resources.push(json!({"_id":format!("env_{}", &stable_id(&env.name)[..12]),"_type":"environment","parentId":workspace_id,"name":env.name,"data":env.variables}));
    }
    let doc = json!({"_type":"export","__export_format":4,"__export_source":"openapi-collection-bridge/0.1.0","resources":resources});
    write_json(output, &doc)?;
    let mut findings = vec![finding(
        FindingStatus::Preserved,
        "requests and environments",
        "Insomnia v4 resources retain folders, requests, auth, bodies, and named environments.",
    )];
    if collection.requests.iter().any(|r| !r.scripts.is_empty()) {
        findings.push(finding(FindingStatus::Unsupported, "request scripts/tests", "Insomnia v4 request resources have no portable equivalent for imported Postman/Bruno script blocks."));
    }
    if collection.requests.iter().any(|r| !r.examples.is_empty()) {
        findings.push(finding(
            FindingStatus::Unsupported,
            "response examples",
            "Insomnia v4 export has no neutral request-attached example representation.",
        ));
    }
    Ok(findings)
}

fn export_bruno(collection: &Collection, output: &Path) -> Result<Vec<Finding>> {
    fs::create_dir_all(output).with_context(|| format!("failed to create {}", output.display()))?;
    write_json(
        &output.join("bruno.json"),
        &json!({"version":"1","name":collection.name,"type":"collection","ignore":["node_modules", ".git"]}),
    )?;
    let mut names: BTreeMap<String, usize> = BTreeMap::new();
    for (index, request) in collection.requests.iter().enumerate() {
        let mut dir = output.to_path_buf();
        for part in &request.folder {
            dir.push(safe_name(part));
        }
        fs::create_dir_all(&dir)?;
        let base = safe_name(&request.name);
        let count = names
            .entry(format!("{}/{}", dir.display(), base))
            .or_default();
        *count += 1;
        let suffix = if *count == 1 {
            String::new()
        } else {
            format!("-{}", *count)
        };
        let path = dir.join(format!("{base}{suffix}.bru"));
        let mut text = format!("meta {{\n  name: {}\n  type: http\n  seq: {}\n}}\n\n{} {{\n  url: {}\n  body: {}\n  auth: {}\n}}\n", request.name.replace('\n', " "), index + 1, request.method.to_ascii_lowercase(), request.url, if request.body.is_some() { "json" } else { "none" }, request.auth.as_ref().map(|a| a.kind.as_str()).unwrap_or("none"));
        if !request.headers.is_empty() {
            text.push_str(&format!("\nheaders {{\n{}}}\n", kv_lines(&request.headers)));
        }
        if !request.query.is_empty() {
            let q: BTreeMap<_, _> = request
                .query
                .iter()
                .map(|p| (p.name.clone(), p.value.clone()))
                .collect();
            text.push_str(&format!("\nquery {{\n{}}}\n", kv_lines(&q)));
        }
        if let Some(body) = &request.body {
            text.push_str(&format!("\nbody:json {{\n{}\n}}\n", body.text));
        }
        if let Some(auth) = &request.auth {
            text.push_str(&format!(
                "\nauth:{} {{\n{}}}\n",
                auth.kind,
                kv_lines(&auth.fields)
            ));
        }
        for script in &request.scripts {
            let label = if script.phase.contains("pre") {
                "script:pre-request"
            } else {
                "tests"
            };
            text.push_str(&format!("\n{label} {{\n{}\n}}\n", script.code));
        }
        fs::write(path, text)?;
    }
    if !collection.environments.is_empty() {
        fs::create_dir_all(output.join("environments"))?;
        for env in &collection.environments {
            fs::write(
                output
                    .join("environments")
                    .join(format!("{}.bru", safe_name(&env.name))),
                format!("vars {{\n{}}}\n", kv_lines(&env.variables)),
            )?;
        }
    }
    let mut findings = vec![finding(FindingStatus::Preserved, "requests and environments", "Bruno files retain folder layout, methods, URLs, headers, query values, bodies, auth, scripts, tests, and named variables.")];
    if collection.requests.iter().any(|r| !r.examples.is_empty()) {
        findings.push(finding(
            FindingStatus::Unsupported,
            "response examples",
            "Portable Bruno .bru request files do not retain imported response examples.",
        ));
    }
    Ok(findings)
}

fn export_curl(collection: &Collection, output: &Path) -> Result<Vec<Finding>> {
    ensure_parent(output)?;
    let mut lines = vec![
        "# Generated by OpenAPI Collection Bridge; review credential placeholders before use."
            .to_owned(),
    ];
    for request in &collection.requests {
        let mut url = request.url.clone();
        if !request.query.is_empty() {
            url.push(if url.contains('?') { '&' } else { '?' });
            url.push_str(
                &request
                    .query
                    .iter()
                    .map(|p| format!("{}={}", p.name, p.value))
                    .collect::<Vec<_>>()
                    .join("&"),
            );
        }
        let mut parts = vec![
            "curl".into(),
            "--request".into(),
            shell_quote(&request.method),
        ];
        for (key, value) in &request.headers {
            parts.push("--header".into());
            parts.push(shell_quote(&format!("{key}: {value}")));
        }
        if let Some(body) = &request.body {
            parts.push("--data-raw".into());
            parts.push(shell_quote(&body.text));
        }
        if let Some(auth) = &request.auth {
            if auth.kind == "basic" {
                let user = auth.fields.get("username").cloned().unwrap_or_default();
                let password = auth.fields.get("password").cloned().unwrap_or_default();
                parts.push("--user".into());
                parts.push(shell_quote(&format!("{user}:{password}")));
            } else if let Some(token) = auth.fields.get("token").or_else(|| auth.fields.get("key"))
            {
                parts.push("--header".into());
                parts.push(shell_quote(&format!("Authorization: Bearer {token}")));
            }
        }
        parts.push(shell_quote(&url));
        lines.push(parts.join(" "));
    }
    fs::write(output, format!("{}\n", lines.join("\n\n")))?;
    let mut findings = vec![finding(
        FindingStatus::Transformed,
        "requests",
        "Each request became a quoted, non-executed cURL command.",
    )];
    if !collection.environments.is_empty() {
        findings.push(finding(
            FindingStatus::Unsupported,
            "environments",
            "cURL command text has no named environment container.",
        ));
    }
    if collection.requests.iter().any(|r| !r.scripts.is_empty()) {
        findings.push(finding(
            FindingStatus::Unsupported,
            "request scripts/tests",
            "cURL cannot represent client pre-request or test scripts.",
        ));
    }
    if collection.requests.iter().any(|r| !r.examples.is_empty()) {
        findings.push(finding(
            FindingStatus::Unsupported,
            "response examples",
            "cURL commands do not carry response examples.",
        ));
    }
    Ok(findings)
}

fn write_json(path: &Path, value: &Value) -> Result<()> {
    ensure_parent(path)?;
    let mut text = serde_json::to_string_pretty(value)?;
    text.push('\n');
    fs::write(path, text).with_context(|| format!("failed to write {}", path.display()))
}

fn parse_json_or_string(text: &str) -> Value {
    serde_json::from_str(text).unwrap_or_else(|_| Value::String(text.into()))
}
fn url_path(url: &str) -> String {
    let no_query = url.split('?').next().unwrap_or(url);
    if let Some(rest) = no_query.split_once("://").map(|(_, r)| r) {
        format!("/{}", rest.split_once('/').map(|(_, p)| p).unwrap_or(""))
    } else if no_query.starts_with('/') {
        no_query.into()
    } else {
        format!("/{no_query}")
    }
}
fn safe_name(input: &str) -> String {
    let s = slug(input).replace('_', "-");
    if s.is_empty() {
        "request".into()
    } else {
        s
    }
}
fn kv_lines(values: &BTreeMap<String, String>) -> String {
    values
        .iter()
        .map(|(k, v)| format!("  {k}: {}\n", v.replace('\n', "\\n")))
        .collect()
}
fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_paths_are_stable() {
        assert_eq!(url_path("https://api.test/v1/pets?q=1"), "/v1/pets");
        assert_eq!(url_path("{{base_url}}/pets"), "/{{base_url}}/pets");
    }

    #[test]
    fn shell_values_are_single_quoted() {
        assert_eq!(shell_quote("a'b"), "'a'\\''b'");
    }
}
