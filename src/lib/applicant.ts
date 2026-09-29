import { execute, query } from "./db";

export type ApplicantDetails = {
  FullName: string;
  Email: string;
  Phone: string;
  CurrentLocation: string;
  LinkedInUrl: string;
  PortfolioUrl: string;
  CurrentCtcLpa: number | null;
  ExpectedCtcLpa: number | null;
  NoticePeriod: string;
  Relocation: string;
  AdditionalInfo: string;
};

export const EMPTY_DETAILS: ApplicantDetails = {
  FullName: "",
  Email: "",
  Phone: "",
  CurrentLocation: "",
  LinkedInUrl: "",
  PortfolioUrl: "",
  CurrentCtcLpa: null,
  ExpectedCtcLpa: null,
  NoticePeriod: "",
  Relocation: "",
  AdditionalInfo: "",
};

export async function getApplicantDetails(): Promise<ApplicantDetails> {
  const [row] = await query<ApplicantDetails>(
    `SELECT FullName, Email, Phone, CurrentLocation, LinkedInUrl, PortfolioUrl, CAST(CurrentCtcLpa AS FLOAT) AS CurrentCtcLpa,
            CAST(ExpectedCtcLpa AS FLOAT) AS ExpectedCtcLpa, NoticePeriod, Relocation, AdditionalInfo
       FROM dbo.ApplicantDetails WHERE Id = 1`,
  );
  return row ?? EMPTY_DETAILS;
}

export async function saveApplicantDetails(d: ApplicantDetails): Promise<void> {
  await execute(
    `MERGE dbo.ApplicantDetails AS t USING (SELECT 1 AS Id) AS s ON t.Id = s.Id
     WHEN MATCHED THEN UPDATE SET FullName = @FullName, Email = @Email, Phone = @Phone, CurrentLocation = @CurrentLocation,
          LinkedInUrl = @LinkedInUrl, PortfolioUrl = @PortfolioUrl, CurrentCtcLpa = @CurrentCtcLpa, ExpectedCtcLpa = @ExpectedCtcLpa,
          NoticePeriod = @NoticePeriod, Relocation = @Relocation, AdditionalInfo = @AdditionalInfo, UpdatedAt = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT (Id, FullName, Email, Phone, CurrentLocation, LinkedInUrl, PortfolioUrl, CurrentCtcLpa,
          ExpectedCtcLpa, NoticePeriod, Relocation, AdditionalInfo)
          VALUES (1, @FullName, @Email, @Phone, @CurrentLocation, @LinkedInUrl, @PortfolioUrl, @CurrentCtcLpa, @ExpectedCtcLpa,
          @NoticePeriod, @Relocation, @AdditionalInfo);`,
    { ...d },
  );
}

/** Plain-text summary for prompts; missing items are named so the model uses a placeholder instead of guessing. */
export function describeDetails(d: ApplicantDetails): string {
  const line = (label: string, value: string | number | null) =>
    `${label}: ${value === null || value === "" ? "NOT PROVIDED (use a [placeholder])" : value}`;
  return [
    line("Current location", d.CurrentLocation),
    line("Current CTC (lakh per annum)", d.CurrentCtcLpa),
    line("Expected CTC (lakh per annum)", d.ExpectedCtcLpa),
    line("Notice period", d.NoticePeriod),
    line("Relocation / commute", d.Relocation),
    line("Other information", d.AdditionalInfo),
  ].join("\n");
}
