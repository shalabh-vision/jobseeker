// Manage the automatic fetch from the command line (the Fetch runs page has the same buttons).
//   npm run schedule:install [-- 09:30]   npm run schedule:remove   npm run schedule:status
import { getScheduleStatus, installSchedule, removeSchedule } from "../src/lib/automation";

async function main() {
  const [command, time = "09:30"] = process.argv.slice(2);
  if (command === "install") {
    await installSchedule(time);
    console.log(`Automatic fetch scheduled daily at ${time} (runs when the fetch interval, 7 days by default, has passed since the last fetch).`);
  } else if (command === "remove") {
    await removeSchedule();
    console.log("Automatic fetch removed.");
  }
  console.log(await getScheduleStatus());
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
