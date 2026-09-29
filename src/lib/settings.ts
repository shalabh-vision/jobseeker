import { execute, query } from "./db";

export async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const [row] = await query<{ Value: string }>("SELECT [Value] FROM dbo.AppSettings WHERE [Key] = @key", { key });
  const value = Number(row?.Value);
  return Number.isFinite(value) ? value : fallback;
}

export async function getStringSetting(key: string, fallback: string): Promise<string> {
  const [row] = await query<{ Value: string }>("SELECT [Value] FROM dbo.AppSettings WHERE [Key] = @key", { key });
  return row?.Value ?? fallback;
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await query<{ Key: string; Value: string }>("SELECT [Key], [Value] FROM dbo.AppSettings");
  return Object.fromEntries(rows.map((r) => [r.Key, r.Value]));
}

export async function setSetting(key: string, value: string): Promise<void> {
  await execute(
    `MERGE dbo.AppSettings AS t USING (SELECT @key AS [Key]) AS s ON t.[Key] = s.[Key]
     WHEN MATCHED THEN UPDATE SET [Value] = @value, UpdatedAt = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT ([Key], [Value]) VALUES (@key, @value);`,
    { key, value },
  );
}
