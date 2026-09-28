import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sql = await readFile(new URL("./usage-report.sql", import.meta.url), "utf8");
const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
// --file uses D1's bulk-import path, which discards SELECT results. Keep the
// SQL in one explicit argument so leading SQL comments cannot become options.
const output = execFileSync(process.execPath, [
  wrangler, "d1", "execute", "USAGE_DB", "--env", "production", "--remote",
  `--command=${sql}`, "--json",
], {
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  encoding: "utf8", timeout: 60_000, maxBuffer: 2 * 1024 * 1024,
  stdio: ["ignore", "pipe", "inherit"],
});
const reports = JSON.parse(output);
const titles = ["Unique update-check installations", "Closed-day totals (up to 90 days)", "Latest observed version (last 30 UTC dates)"];
if (!Array.isArray(reports) || reports.length !== titles.length
    || reports.some(report => !report.success || !Array.isArray(report.results))) {
  throw new Error("Unexpected statistics query result; no report was produced.");
}
for (let index = 0; index < reports.length; index++) {
  console.log(`\n${titles[index]}`);
  if (reports[index].results.length) console.table(reports[index].results);
  else console.log("No observations yet.");
}
