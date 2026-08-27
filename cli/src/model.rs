use clap::ValueEnum;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt::{Display, Formatter};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, ValueEnum)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Openapi,
    Postman,
    Insomnia,
    Bruno,
    Curl,
}

impl Display for Format {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{}",
            serde_json::to_value(self).unwrap().as_str().unwrap()
        )
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Collection {
    pub name: String,
    pub source: Option<Format>,
    pub requests: Vec<Request>,
    pub environments: Vec<Environment>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Request {
    pub name: String,
    pub method: String,
    pub url: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub folder: Vec<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub headers: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub query: Vec<Pair>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<Body>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth: Option<Auth>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub examples: Vec<Example>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub scripts: Vec<Script>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Pair {
    pub name: String,
    pub value: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Body {
    pub mime: String,
    pub text: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Auth {
    pub kind: String,
    pub fields: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Example {
    pub name: String,
    pub status: u16,
    pub body: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Script {
    pub phase: String,
    pub code: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Environment {
    pub name: String,
    pub variables: BTreeMap<String, String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FindingStatus {
    Preserved,
    Transformed,
    Unsupported,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Finding {
    pub status: FindingStatus,
    pub feature: String,
    pub detail: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Counts {
    pub requests: usize,
    pub environments: usize,
    pub preserved: usize,
    pub transformed: usize,
    pub unsupported: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct BridgeResult {
    pub status: String,
    pub source: Format,
    pub target: Format,
    pub output: String,
    pub report: String,
    pub counts: Counts,
}

pub fn finding(
    status: FindingStatus,
    feature: impl Into<String>,
    detail: impl Into<String>,
) -> Finding {
    Finding {
        status,
        feature: feature.into(),
        detail: detail.into(),
    }
}

pub fn stable_id(input: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in input.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", hash)
}
