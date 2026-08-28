use openapi_collection_bridge::model::{Body, Collection, Environment, Format, Request};
use std::collections::BTreeMap;
use std::process::Command;

#[test]
fn documented_openapi_to_bruno_flow_writes_evidence() {
    let temp = tempfile::tempdir().unwrap();
    let input = temp.path().join("pets.yaml");
    std::fs::write(&input, "openapi: 3.1.0\ninfo: {title: Pets, version: 1}\nservers: [{url: https://api.test}]\npaths:\n  /pets:\n    get:\n      summary: List pets\n      responses: {'200': {description: ok}}\n").unwrap();
    let output = temp.path().join("bruno");
    let (result, _) = openapi_collection_bridge::convert(
        input.to_str().unwrap(),
        None,
        Format::Bruno,
        &output,
        &[],
        false,
    )
    .unwrap();
    assert_eq!(result.counts.requests, 1);
    assert!(output.join("list-pets.bru").is_file());
    assert!(output.join("bridge-report.md").is_file());
}

#[test]
fn secrets_are_redacted_by_default() {
    let temp = tempfile::tempdir().unwrap();
    let output = temp.path().join("collection.json");
    openapi_collection_bridge::convert(
        "curl -H 'Authorization: Bearer very-secret' --data-raw '{\"password\":\"body-leak\"}' 'https://api.test/me?api_key=query-leak'",
        Some(Format::Curl),
        Format::Postman,
        &output,
        &[],
        false,
    )
    .unwrap();
    let content = std::fs::read_to_string(output).unwrap();
    assert!(!content.contains("very-secret"));
    assert!(!content.contains("body-leak"));
    assert!(!content.contains("query-leak"));
    assert!(content.contains("bridge_secret_authorization"));
    assert!(content.contains("bridge_secret_password"));
    assert!(content.contains("bridge_secret_api_key"));
}

#[test]
fn output_is_deterministic() {
    let temp = tempfile::tempdir().unwrap();
    let a = temp.path().join("a.json");
    let b = temp.path().join("b.json");
    let input = "curl https://api.test/ping";
    openapi_collection_bridge::convert(input, Some(Format::Curl), Format::Openapi, &a, &[], false)
        .unwrap();
    openapi_collection_bridge::convert(input, Some(Format::Curl), Format::Openapi, &b, &[], false)
        .unwrap();
    assert_eq!(std::fs::read(a).unwrap(), std::fs::read(b).unwrap());
}

#[test]
fn representative_collection_exports_every_request_and_environment() {
    let temp = tempfile::tempdir().unwrap();
    let requests = (0..20)
        .map(|index| Request {
            name: format!("Request {index}"),
            method: if index % 2 == 0 { "GET" } else { "POST" }.into(),
            url: format!("https://api.test/items/{index}"),
            body: (index % 2 == 1).then(|| Body {
                mime: "application/json".into(),
                text: format!("{{\"index\":{index}}}"),
            }),
            ..Default::default()
        })
        .collect();
    let environments = ["Development", "Production"]
        .into_iter()
        .map(|name| Environment {
            name: name.into(),
            variables: BTreeMap::from([(
                "base_url".into(),
                format!("https://{}.api.test", name.to_lowercase()),
            )]),
        })
        .collect();
    let collection = Collection {
        name: "Pilot".into(),
        source: None,
        requests,
        environments,
    };

    let bruno = temp.path().join("bruno");
    openapi_collection_bridge::export_collection(&collection, Format::Bruno, &bruno).unwrap();
    let (round_trip, _) =
        openapi_collection_bridge::import_collection(bruno.to_str().unwrap(), Format::Bruno)
            .unwrap();
    assert_eq!(
        (round_trip.requests.len(), round_trip.environments.len()),
        (20, 2)
    );

    let insomnia = temp.path().join("insomnia.json");
    openapi_collection_bridge::export_collection(&collection, Format::Insomnia, &insomnia).unwrap();
    let (round_trip, _) =
        openapi_collection_bridge::import_collection(insomnia.to_str().unwrap(), Format::Insomnia)
            .unwrap();
    assert_eq!(
        (round_trip.requests.len(), round_trip.environments.len()),
        (20, 2)
    );

    let postman = temp.path().join("postman.json");
    openapi_collection_bridge::export_collection(&collection, Format::Postman, &postman).unwrap();
    let exported: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&postman).unwrap()).unwrap();
    assert_eq!(exported["item"].as_array().unwrap().len(), 20);
    assert!(temp
        .path()
        .join("postman.development.postman_environment.json")
        .is_file());
    assert!(temp
        .path()
        .join("postman.production.postman_environment.json")
        .is_file());
}

#[test]
fn postman_auth_maps_to_native_openapi_schemes_with_explicit_evidence() {
    let temp = tempfile::tempdir().unwrap();
    let input = temp.path().join("auth.postman_collection.json");
    std::fs::write(
        &input,
        r#"{
          "info":{"name":"Auth fixtures","schema":"https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
          "item":[
            {"name":"Basic","request":{"method":"GET","url":"https://api.test/basic","auth":{"type":"basic","basic":[{"key":"username","value":"alice"},{"key":"password","value":"wonderland"}]}}},
            {"name":"Header key","request":{"method":"GET","url":"https://api.test/key","auth":{"type":"apikey","apikey":[{"key":"key","value":"X-API-Key"},{"key":"value","value":"abc123"},{"key":"in","value":"header"}]}}},
            {"name":"Query key","request":{"method":"GET","url":"https://api.test/query","auth":{"type":"apikey","apikey":[{"key":"key","value":"api_key"},{"key":"value","value":"query-secret"},{"key":"in","value":"query"}]}}},
            {"name":"OAuth","request":{"method":"GET","url":"https://api.test/oauth","auth":{"type":"oauth2","oauth2":[{"key":"authUrl","value":"https://id.test/authorize"},{"key":"accessTokenUrl","value":"https://id.test/token"},{"key":"accessToken","value":"token-123"},{"key":"scope","value":"read write"}]}}}
          ]
        }"#,
    )
    .unwrap();
    let output = temp.path().join("auth.openapi.json");
    let (result, findings) = openapi_collection_bridge::convert(
        input.to_str().unwrap(),
        Some(Format::Postman),
        Format::Openapi,
        &output,
        &[],
        true,
    )
    .unwrap();
    let doc: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&output).unwrap()).unwrap();
    let schemes = doc["components"]["securitySchemes"].as_object().unwrap();
    assert!(schemes
        .values()
        .any(|scheme| scheme["type"] == "http" && scheme["scheme"] == "basic"));
    assert!(schemes.values().any(|scheme| scheme["type"] == "apiKey"
        && scheme["name"] == "X-API-Key"
        && scheme["in"] == "header"));
    assert!(schemes.values().any(|scheme| scheme["type"] == "apiKey"
        && scheme["name"] == "api_key"
        && scheme["in"] == "query"));
    assert!(schemes.values().any(|scheme| scheme["type"] == "oauth2"));
    assert_eq!(
        doc["paths"]["/key"]["get"]["x-bridge-auth-fields"]["value"],
        "abc123"
    );
    assert_eq!(
        doc["paths"]["/basic"]["get"]["x-bridge-auth-fields"]["username"],
        "alice"
    );
    assert!(!doc.to_string().contains("bridgeAuth"));
    assert!(findings
        .iter()
        .any(|f| f.feature.contains("apikey authentication") && f.detail.contains("X-API-Key")));
    assert_eq!(result.counts.unsupported, 0);
    let report = std::fs::read_to_string(result.report).unwrap();
    assert!(report.contains("Basic scheme"));
    assert!(report.contains("apiKey scheme preserves 'X-API-Key' in 'header'"));
}

#[test]
fn openapi_auth_round_trips_to_postman_without_collapsing_fields() {
    let temp = tempfile::tempdir().unwrap();
    let input = temp.path().join("auth.openapi.json");
    std::fs::write(
        &input,
        r#"{
          "openapi":"3.1.0", "info":{"title":"Auth","version":"1"},
          "components":{"securitySchemes":{
            "basic":{"type":"http","scheme":"basic"},
            "key":{"type":"apiKey","name":"X-API-Key","in":"header"},
            "queryKey":{"type":"apiKey","name":"api_key","in":"query"},
            "bearer":{"type":"http","scheme":"bearer"},
            "oauth":{"type":"oauth2","flows":{"authorizationCode":{"authorizationUrl":"https://id.test/authorize","tokenUrl":"https://id.test/token","scopes":{"read":"read data"}}}}
          }},
          "paths":{
            "/basic":{"get":{"security":[{"basic":[]}],"x-bridge-auth-fields":{"username":"alice","password":"wonderland"},"responses":{"200":{"description":"ok"}}}},
            "/key":{"get":{"security":[{"key":[]}],"x-bridge-auth-fields":{"value":"abc123"},"responses":{"200":{"description":"ok"}}}},
            "/query":{"get":{"security":[{"queryKey":[]}],"x-bridge-auth-fields":{"value":"query-secret"},"responses":{"200":{"description":"ok"}}}},
            "/bearer":{"get":{"security":[{"bearer":[]}],"x-bridge-auth-fields":{"token":"token-123"},"responses":{"200":{"description":"ok"}}}},
            "/oauth":{"get":{"security":[{"oauth":[]}],"x-bridge-auth-fields":{"accessToken":"oauth-token"},"responses":{"200":{"description":"ok"}}}}
          }
        }"#,
    )
    .unwrap();
    let output = temp.path().join("auth.postman.json");
    openapi_collection_bridge::convert(
        input.to_str().unwrap(),
        Some(Format::Openapi),
        Format::Postman,
        &output,
        &[],
        true,
    )
    .unwrap();
    let doc: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&output).unwrap()).unwrap();
    let auth = |name: &str| -> serde_json::Value {
        doc["item"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["name"] == name)
            .unwrap()["request"]["auth"]
            .clone()
    };
    assert_eq!(auth("GET /basic")["type"], "basic");
    assert_eq!(auth("GET /basic")["basic"][0]["key"], "password");
    assert!(auth("GET /basic")["basic"].to_string().contains("alice"));
    assert_eq!(auth("GET /key")["apikey"][0]["key"], "in");
    assert!(auth("GET /key")["apikey"].to_string().contains("X-API-Key"));
    assert!(auth("GET /query")["apikey"].to_string().contains("query"));
    assert_eq!(auth("GET /bearer")["type"], "bearer");
    assert!(auth("GET /oauth")["oauth2"]
        .to_string()
        .contains("https://id.test/token"));
}

#[test]
fn documented_cli_exit_codes_distinguish_input_conversion_and_loss() {
    let temp = tempfile::tempdir().unwrap();
    let bin = env!("CARGO_BIN_EXE_ocb");
    let empty = temp.path().join("empty.json");
    std::fs::write(
        &empty,
        r#"{"openapi":"3.1.0","info":{"title":"Empty","version":"1"},"paths":{}}"#,
    )
    .unwrap();
    let blocked_parent = temp.path().join("not-a-directory");
    std::fs::write(&blocked_parent, "file").unwrap();
    let blocked_output = blocked_parent.join("output.json");
    assert_eq!(
        Command::new(bin)
            .args([
                "convert",
                empty.to_str().unwrap(),
                "--to",
                "postman",
                "--output",
                temp.path().join("out.json").to_str().unwrap()
            ])
            .status()
            .unwrap()
            .code(),
        Some(2)
    );
    assert_eq!(
        Command::new(bin)
            .args([
                "convert",
                "not-a-format",
                "--to",
                "postman",
                "--output",
                temp.path().join("out.json").to_str().unwrap()
            ])
            .status()
            .unwrap()
            .code(),
        Some(2)
    );
    assert_eq!(
        Command::new(bin)
            .args([
                "convert",
                "curl https://api.test",
                "--from",
                "curl",
                "--to",
                "postman",
                "--output",
                blocked_output.to_str().unwrap()
            ])
            .status()
            .unwrap()
            .code(),
        Some(3)
    );
    let scripted = temp.path().join("scripted.postman.json");
    std::fs::write(&scripted, r#"{"info":{"name":"Script","schema":"https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},"item":[{"name":"one","event":[{"listen":"test","script":{"exec":["pm.test('x', () => {})"]}}],"request":{"url":"https://api.test"}}]}"#).unwrap();
    assert_eq!(
        Command::new(bin)
            .args([
                "convert",
                scripted.to_str().unwrap(),
                "--to",
                "openapi",
                "--output",
                temp.path().join("scripted.json").to_str().unwrap(),
                "--fail-on-loss"
            ])
            .status()
            .unwrap()
            .code(),
        Some(4)
    );
}
