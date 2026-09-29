import { query } from "@/lib/db";

// Downloads the stored resume exactly as uploaded.
export async function GET() {
  const [row] = await query<{ ResumeFileName: string; ResumeFile: Buffer }>(
    "SELECT ResumeFileName, ResumeFile FROM dbo.Profile WHERE Id = 1",
  );
  if (!row) return new Response("No resume uploaded yet", { status: 404 });
  return new Response(new Uint8Array(row.ResumeFile), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${row.ResumeFileName.replace(/"/g, "")}"`,
    },
  });
}
