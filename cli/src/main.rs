use clap::{Parser, Subcommand};
use openapi_collection_bridge::model::Format;
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    name = "ocb",
    version,
    about = "Convert API collections with an explicit semantic-loss report",
    long_about = "OpenAPI Collection Bridge converts locally between OpenAPI, Postman, Insomnia, Bruno, and cURL. Credentials are replaced with placeholders by default. No request is executed and no input leaves this machine."
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Convert a file, Bruno directory, or literal cURL command
    Convert {
        /// Input path, Bruno directory, or quoted cURL command
        input: String,
        /// Source format; detected for known files when omitted
        #[arg(long, value_enum)]
        from: Option<Format>,
        /// Destination format
        #[arg(long, value_enum)]
        to: Format,
        /// Destination file, or directory for Bruno
        #[arg(short, long)]
        output: PathBuf,
        /// Postman environment JSON to merge (repeatable)
        #[arg(long = "environment")]
        environments: Vec<PathBuf>,
        /// Include literal secrets instead of safe placeholders
        #[arg(long)]
        include_secrets: bool,
        /// Exit 4 after writing output if any semantics are unsupported
        #[arg(long)]
        fail_on_loss: bool,
        /// Print the result as JSON
        #[arg(long)]
        json: bool,
    },
    /// Parse and inventory a source without exporting it
    Inspect {
        input: String,
        #[arg(long, value_enum)]
        from: Option<Format>,
        #[arg(long)]
        json: bool,
    },
    /// List supported source and destination formats
    Formats {
        #[arg(long)]
        json: bool,
    },
}

fn main() {
    let cli = Cli::parse();
    let exit = match run(cli) {
        Ok(code) => code,
        Err(error) => {
            eprintln!("error: {error:#}");
            if openapi_collection_bridge::is_invalid_input(&error) {
                2
            } else {
                3
            }
        }
    };
    std::process::exit(exit);
}

fn run(cli: Cli) -> anyhow::Result<i32> {
    match cli.command {
        Command::Convert {
            input,
            from,
            to,
            output,
            environments,
            include_secrets,
            fail_on_loss,
            json,
        } => {
            let (result, findings) = openapi_collection_bridge::convert(
                &input,
                from,
                to,
                &output,
                &environments,
                include_secrets,
            )?;
            if json {
                println!("{}", serde_json::to_string_pretty(&result)?);
            } else {
                println!(
                    "Converted {} request(s) and {} environment(s): {}",
                    result.counts.requests, result.counts.environments, result.output
                );
                println!(
                    "Evidence: {} preserved, {} transformed, {} unsupported → {}",
                    result.counts.preserved,
                    result.counts.transformed,
                    result.counts.unsupported,
                    result.report
                );
            }
            Ok(
                if fail_on_loss
                    && findings.iter().any(|f| {
                        f.status == openapi_collection_bridge::model::FindingStatus::Unsupported
                    })
                {
                    4
                } else {
                    0
                },
            )
        }
        Command::Inspect { input, from, json } => {
            let (collection, findings) = openapi_collection_bridge::inspect(&input, from)?;
            if json {
                println!(
                    "{}",
                    serde_json::to_string_pretty(
                        &serde_json::json!({"collection": collection, "findings": findings})
                    )?
                );
            } else {
                println!(
                    "{}: {} request(s), {} environment(s)",
                    collection.name,
                    collection.requests.len(),
                    collection.environments.len()
                );
                for request in collection.requests {
                    println!("{} {} — {}", request.method, request.url, request.name);
                }
            }
            Ok(0)
        }
        Command::Formats { json } => {
            let formats = ["openapi", "postman", "insomnia", "bruno", "curl"];
            if json {
                println!("{}", serde_json::to_string(&formats)?);
            } else {
                println!(
                    "Supported sources and destinations:\n  {}",
                    formats.join("\n  ")
                );
            }
            Ok(0)
        }
    }
}
