// Fetches, filters and scores job postings. Run by Windows Task Scheduler every morning and by "Run now".
//   npm run fetch                -> run now, regardless of when the last run was
//   ... --trigger=scheduled      -> only run if the fetch interval (default 3 days) has passed
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { closePool } from "../src/lib/db";
import { getNextDueAt, runFetch } from "../src/lib/fetch-run";

const trigger = process.argv.includes("--trigger=scheduled") ? "scheduled" : "manual";
const logDir = path.join(process.cwd(), "logs");
mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, "fetch.log");

function print(line: string) {
  console.log(line);
  appendFileSync(logFile, line + "\n");
}

async function main() {
  print(`\n=== ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} (${trigger}) ===`);
  if (trigger === "scheduled") {
    const due = await getNextDueAt();
    // The task checks once each morning: run if the fetch falls due at any time today, otherwise a fetch due at
    // 4 pm would wait until the next morning and the interval would stretch by a day.
    if (due && due.getTime() - 16 * 3_600_000 > Date.now()) {
      print(`Skipped: next fetch is due ${due.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`);
      return;
    }
  }
  const run = await runFetch(trigger, print);
  if (run.Status === "failed") process.exitCode = 1;
}

main()
  .catch((err) => {
    print(`Fatal: ${err instanceof Error ? err.stack : String(err)}`);
    process.exitCode = 1;
  })
  .finally(closePool);
