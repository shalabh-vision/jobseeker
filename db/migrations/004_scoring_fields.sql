-- Fields filled by the Gemini scoring step, and settings for the automated fetch.

ALTER TABLE dbo.JobPostings ADD
    RequiredYears  DECIMAL(4, 1)  NULL,
    Industry       NVARCHAR(200)  NULL,
    -- True when the employer is in one of the saved search's preferred industries
    IndustryMatch  BIT            NULL;
GO

ALTER TABLE dbo.FetchRuns ADD
    Refined        BIT            NOT NULL CONSTRAINT DF_FetchRuns_Refined DEFAULT 0;
GO

INSERT dbo.AppSettings ([Key], [Value]) VALUES
    -- Postings asking for fewer years than this are too junior (the resume analysis suggests 12; many senior
    -- Indian postings ask for 8-10+, so the filter is looser than the profile)
    (N'filter.minRequiredYears', N'8'),
    (N'fetch.scheduleTime',      N'09:30');
GO
