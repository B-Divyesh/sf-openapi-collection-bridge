use openapi_collection_bridge::model::{Body, Collection, Environment, Format, Request};
use std::collections::BTreeMap;

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
