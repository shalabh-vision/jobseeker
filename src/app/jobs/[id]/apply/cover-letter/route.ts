import { Document, Packer, Paragraph, TextRun } from "docx";
import { getApplicantDetails } from "@/lib/applicant";
import { getKit } from "@/lib/apply";
import { getJob } from "@/lib/jobs";

// Builds the (possibly edited) cover letter as a Word document with the applicant's contact details on top.
export async function GET(_request: Request, { params }: RouteContext<"/jobs/[id]/apply/cover-letter">) {
  const jobId = Number((await params).id);
  const [job, kit, details] = await Promise.all([getJob(jobId), getKit(jobId), getApplicantDetails()]);
  if (!job || !kit) return new Response("Generate the application kit first", { status: 404 });

  const contact = [details.Email, details.Phone, details.CurrentLocation, details.LinkedInUrl].filter(Boolean).join("  |  ");
  const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date());
  const font = { font: "Calibri", size: 22 };

  const doc = new Document({
    sections: [
      {
        children: [
          ...(details.FullName ? [new Paragraph({ children: [new TextRun({ text: details.FullName, bold: true, font: "Calibri", size: 28 })] })] : []),
          ...(contact ? [new Paragraph({ children: [new TextRun({ text: contact, ...font, size: 20 })] })] : []),
          new Paragraph({ children: [new TextRun({ text: date, ...font })], spacing: { before: 240, after: 240 } }),
          ...kit.coverLetter
            .split(/\n{2,}/)
            .map((p) => new Paragraph({ children: [new TextRun({ text: p.replace(/\n/g, " "), ...font })], spacing: { after: 200 } })),
        ],
      },
    ],
  });
  const buffer = await Packer.toBuffer(doc);
  const safe = (s: string) => s.replace(/[^\w.-]+/g, "_").slice(0, 60);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="Cover_Letter_${safe(job.EmployerName)}_${safe(job.Title)}.docx"`,
    },
  });
}
