import "dotenv/config";
import { boot } from "./boot";
import { ConfigError, loadConfig } from "./config";

/**
 * `npm start` (FR-EXM-102). Reads `.env`, boots, and prints each run and Event as
 * `HH:MM:SS  …`. A missing required setting exits 1 naming the variable (FR-EXM-101).
 */

const clock = () => new Date().toTimeString().slice(0, 8);

let config;
try {
  config = loadConfig(process.env);
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

boot(config, {
  out: (line) => console.log(line),
  log: (line) => console.log(line.startsWith("{") ? line : `${clock()}  ${line}`),
  logJson: process.env.LOG_JSON !== "0",
  // FR-EXM-121: the mock runner is a tests/CI seam, never a documented way to run this example.
  ...(process.env.LAMBDA_RUNNER_MODE === "mock" ? { runnerMode: "mock" as const } : {}),
}).catch((err: Error) => {
  console.error(`Could not start: ${err.message}`);
  process.exit(1);
});
