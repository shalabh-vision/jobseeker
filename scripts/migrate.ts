// Applies db/migrations/*.sql in name order, once each. Usage: npm run db:migrate
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { closePool, getPool, query, sql } from "../src/lib/db";

const dir = path.join(process.cwd(), "db", "migrations");

async function main() {
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.SchemaMigrations') IS NULL
      CREATE TABLE dbo.SchemaMigrations (
        Name NVARCHAR(200) NOT NULL PRIMARY KEY,
        AppliedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
      );`);
  const applied = new Set((await query<{ Name: string }>("SELECT Name FROM dbo.SchemaMigrations")).map((r) => r.Name));

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    const batches = readFileSync(path.join(dir, file), "utf8").split(/^\s*GO\s*$/im).filter((b) => b.trim());
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      for (const batch of batches) await new sql.Request(tx).query(batch);
      await new sql.Request(tx).input("name", file).query("INSERT dbo.SchemaMigrations (Name) VALUES (@name)");
      await tx.commit();
      console.log(`applied ${file}`);
    } catch (err) {
      await tx.rollback();
      throw new Error(`${file} failed: ${(err as Error).message}`);
    }
  }
  console.log("database is up to date");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
