import { execute, query } from "../db";

export type InsightKind = "cities" | "roles" | "employers" | "swot";

export async function getInsight<T>(kind: InsightKind): Promise<{ data: T; model: string | null; updatedAt: Date } | null> {
  const [row] = await query<{ DataJson: string; Model: string | null; UpdatedAt: Date }>(
    "SELECT DataJson, Model, UpdatedAt FROM dbo.CareerInsights WHERE Kind = @kind",
    { kind },
  );
  return row ? { data: JSON.parse(row.DataJson) as T, model: row.Model, updatedAt: row.UpdatedAt } : null;
}

export async function saveInsight(kind: InsightKind, data: unknown, model: string | null = null) {
  await execute(
    `MERGE dbo.CareerInsights AS t USING (SELECT @kind AS Kind) AS s ON t.Kind = s.Kind
     WHEN MATCHED THEN UPDATE SET DataJson = @json, Model = @model, UpdatedAt = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT (Kind, DataJson, Model) VALUES (@kind, @json, @model);`,
    { kind, json: JSON.stringify(data), model },
  );
}

const USER_AGENT = "SahiNaukri/0.1 (personal job-search tool; non-commercial)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nextAt: Record<string, number> = {};

/** GET with a per-host pace (Wikidata answers 429 to bursts from this network) and retries on 429/503. */
export async function politeFetch(url: string, init: { accept?: string; paceMs?: number } = {}): Promise<Response> {
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    const wait = (nextAt[host] ?? 0) - Date.now();
    nextAt[host] = Math.max(Date.now(), nextAt[host] ?? 0) + (init.paceMs ?? 1500);
    if (wait > 0) await sleep(wait);
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: init.accept ?? "application/json" },
      signal: AbortSignal.timeout(90_000),
    });
    if ((response.status === 429 || response.status === 503 || response.status === 504) && attempt < 4) {
      await sleep(Number(response.headers.get("retry-after") ?? 0) * 1000 || 15_000 * (attempt + 1));
      continue;
    }
    if (!response.ok) throw new Error(`${response.status} from ${host}`);
    return response;
  }
}
