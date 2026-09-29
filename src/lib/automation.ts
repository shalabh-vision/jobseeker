// Windows Task Scheduler integration for the automatic job fetch, and "Run now" in the background.
import { execFile, spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const TASK_PATH = "\\SahiNaukri\\";
const TASK_NAME = "FetchJobs";

const projectDir = () => process.cwd();
const tsxCli = () => path.join(projectDir(), "node_modules", "tsx", "dist", "cli.mjs");
const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function powershell(script: string): Promise<string> {
  const { stdout } = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    windowsHide: true,
    timeout: 30_000,
  });
  return stdout.trim();
}

export type ScheduleStatus =
  | { installed: false }
  | { installed: true; state: string; time: string; nextRunAt: Date | null; lastRunAt: Date | null; lastResult: number | null };

export async function getScheduleStatus(): Promise<ScheduleStatus> {
  const json = await powershell(`
    $t = Get-ScheduledTask -TaskPath ${psQuote(TASK_PATH)} -TaskName ${psQuote(TASK_NAME)} -ErrorAction SilentlyContinue
    if (-not $t) { 'null'; exit }
    $i = $t | Get-ScheduledTaskInfo
    $iso = { param($d) if ($d -and $d.Year -gt 2000) { $d.ToString('o') } else { $null } }
    [pscustomobject]@{
      State = "$($t.State)"
      Time = ([datetime]$t.Triggers[0].StartBoundary).ToString('HH:mm')
      NextRunTime = & $iso $i.NextRunTime
      LastRunTime = & $iso $i.LastRunTime
      LastTaskResult = $i.LastTaskResult
    } | ConvertTo-Json -Compress`);
  const t = JSON.parse(json || "null");
  if (!t) return { installed: false };
  return {
    installed: true,
    state: t.State,
    time: t.Time,
    nextRunAt: t.NextRunTime ? new Date(t.NextRunTime) : null,
    lastRunAt: t.LastRunTime ? new Date(t.LastRunTime) : null,
    // 267011 = "task has not yet run"
    lastResult: t.LastRunTime && t.LastTaskResult !== 267011 ? t.LastTaskResult : null,
  };
}

/**
 * Registers a daily task for the current user. It runs every day at `time`; the script itself skips the run
 * unless the fetch interval has passed, so a day the PC was off is caught up the next morning.
 */
export async function installSchedule(time: string): Promise<void> {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Time must be HH:mm, e.g. 09:30");
  const args = `"${tsxCli()}" --env-file=.env scripts\\fetch-jobs.ts --trigger=scheduled`;
  await powershell(`
    $a = New-ScheduledTaskAction -Execute ${psQuote(process.execPath)} -Argument ${psQuote(args)} -WorkingDirectory ${psQuote(projectDir())}
    $t = New-ScheduledTaskTrigger -Daily -At ${psQuote(time)}
    $s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
    Register-ScheduledTask -TaskPath ${psQuote(TASK_PATH)} -TaskName ${psQuote(TASK_NAME)} -Action $a -Trigger $t -Settings $s \`
      -Description 'Sahi Naukri: fetch, filter and score job postings (runs every few days; see logs\\fetch.log)' -Force | Out-Null`);
}

export async function removeSchedule(): Promise<void> {
  await powershell(
    `Unregister-ScheduledTask -TaskPath ${psQuote(TASK_PATH)} -TaskName ${psQuote(TASK_NAME)} -Confirm:$false -ErrorAction SilentlyContinue`,
  );
}

/** Starts a fetch in a separate process so it keeps going even if the page is closed. */
export function startFetchNow(): void {
  const logDir = path.join(projectDir(), "logs");
  mkdirSync(logDir, { recursive: true });
  const out = openSync(path.join(logDir, "fetch-console.log"), "a");
  const child = spawn(process.execPath, [tsxCli(), "--env-file=.env", "scripts/fetch-jobs.ts", "--trigger=manual"], {
    cwd: projectDir(),
    detached: true,
    windowsHide: true,
    stdio: ["ignore", out, out],
  });
  child.unref();
}
