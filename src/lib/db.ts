import sql from "mssql/msnodesqlv8";

export { sql };

/**
 * The ATLAS setting is an ADO.NET-style connection string (as used by .NET apps).
 * msnodesqlv8 talks ODBC, so translate the keys we care about.
 */
export function toOdbcConnectionString(ado: string): string {
  const parts = new Map<string, string>();
  for (const pair of ado.split(";")) {
    const i = pair.indexOf("=");
    if (i > 0) parts.set(pair.slice(0, i).trim().toLowerCase(), pair.slice(i + 1).trim());
  }
  const get = (...keys: string[]) => keys.map((k) => parts.get(k)).find((v) => v !== undefined);
  const yes = (v?: string) => (v && /^(true|yes|sspi)$/i.test(v) ? "yes" : "no");

  const server = get("data source", "server", "address");
  const database = get("initial catalog", "database");
  if (!server || !database) throw new Error("ATLAS connection string needs Data Source and Initial Catalog");

  const out = [
    `Driver={${process.env.ODBC_DRIVER ?? "ODBC Driver 18 for SQL Server"}}`,
    `Server=${server}`,
    `Database=${database}`,
    `Encrypt=${yes(get("encrypt"))}`,
    `TrustServerCertificate=${yes(get("trustservercertificate"))}`,
  ];
  const integrated = get("integrated security", "trusted_connection");
  if (integrated && yes(integrated) === "yes") {
    out.push("Trusted_Connection=yes");
  } else {
    out.push(`Uid=${get("user id", "uid") ?? ""}`, `Pwd=${get("password", "pwd") ?? ""}`);
  }
  return out.join(";") + ";";
}

// Survive Next.js dev-mode hot reloads without opening a new pool each time.
const globalForDb = globalThis as unknown as { jobsDbPool?: Promise<sql.ConnectionPool> };

export function getPool(): Promise<sql.ConnectionPool> {
  if (!globalForDb.jobsDbPool) {
    const ado = process.env.ATLAS;
    if (!ado) throw new Error("ATLAS connection string is missing from .env");
    // The msnodesqlv8 driver accepts a raw ODBC connectionString, which @types/mssql does not model.
    const config = { connectionString: toOdbcConnectionString(ado) } as unknown as sql.config;
    const pool = new sql.ConnectionPool(config);
    globalForDb.jobsDbPool = pool.connect().catch((err) => {
      globalForDb.jobsDbPool = undefined;
      throw err;
    });
  }
  return globalForDb.jobsDbPool;
}

/** A parameter value, or an explicit SQL type when inference is not good enough (e.g. VARBINARY). */
export type Param = unknown | { type: sql.ISqlType | (() => sql.ISqlType); value: unknown };
export type Params = Record<string, Param>;

export const typed = (type: sql.ISqlType | (() => sql.ISqlType), value: unknown): Param => ({ type, value });

async function prepare(params: Params) {
  const request = (await getPool()).request();
  for (const [name, p] of Object.entries(params)) {
    if (p && typeof p === "object" && "type" in p && "value" in p) request.input(name, p.type as sql.ISqlType, p.value);
    else request.input(name, p);
  }
  return request;
}

/**
 * msnodesqlv8 reports IDENTITY columns as sqlType "int identity", which mssql does not recognise, so their values
 * arrive as strings with no column type. Convert those back to numbers.
 */
export function fixUntypedNumbers<T>(recordset: sql.IRecordSet<T>): T[] {
  const untyped = Object.values(recordset.columns ?? {})
    .filter((c) => !c.type)
    .map((c) => c.name);
  if (untyped.length === 0) return recordset;
  for (const row of recordset as Record<string, unknown>[]) {
    for (const name of untyped) {
      const v = row[name];
      if (typeof v === "string" && /^-?\d{1,15}$/.test(v)) row[name] = Number(v);
    }
  }
  return recordset;
}

export async function query<T>(text: string, params: Params = {}): Promise<T[]> {
  const request = await prepare(params);
  const result = await request.query<T>(text);
  return result.recordset ? fixUntypedNumbers(result.recordset) : [];
}

export async function execute(text: string, params: Params = {}): Promise<number> {
  const request = await prepare(params);
  const result = await request.query(text);
  return result.rowsAffected.reduce((a, b) => a + b, 0);
}

export async function closePool(): Promise<void> {
  const pool = await globalForDb.jobsDbPool;
  globalForDb.jobsDbPool = undefined;
  await pool?.close();
}
