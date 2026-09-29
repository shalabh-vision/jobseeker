-- Applying: the applicant's form details, a Gemini-written kit per job, and application records.

-- Single row: details application forms always ask for.
CREATE TABLE dbo.ApplicantDetails (
    Id                 INT            NOT NULL CONSTRAINT PK_ApplicantDetails PRIMARY KEY
                                      CONSTRAINT CK_ApplicantDetails_Single CHECK (Id = 1),
    FullName           NVARCHAR(200)  NOT NULL CONSTRAINT DF_ApplicantDetails_FullName DEFAULT N'',
    Email              NVARCHAR(200)  NOT NULL CONSTRAINT DF_ApplicantDetails_Email DEFAULT N'',
    Phone              NVARCHAR(50)   NOT NULL CONSTRAINT DF_ApplicantDetails_Phone DEFAULT N'',
    CurrentLocation    NVARCHAR(200)  NOT NULL CONSTRAINT DF_ApplicantDetails_CurrentLocation DEFAULT N'',
    LinkedInUrl        NVARCHAR(500)  NOT NULL CONSTRAINT DF_ApplicantDetails_LinkedInUrl DEFAULT N'',
    PortfolioUrl       NVARCHAR(500)  NOT NULL CONSTRAINT DF_ApplicantDetails_PortfolioUrl DEFAULT N'',
    CurrentCtcLpa      DECIMAL(6, 2)  NULL,
    ExpectedCtcLpa     DECIMAL(6, 2)  NULL,
    NoticePeriod       NVARCHAR(100)  NOT NULL CONSTRAINT DF_ApplicantDetails_NoticePeriod DEFAULT N'',
    Relocation         NVARCHAR(200)  NOT NULL CONSTRAINT DF_ApplicantDetails_Relocation DEFAULT N'',
    AdditionalInfo     NVARCHAR(MAX)  NOT NULL CONSTRAINT DF_ApplicantDetails_AdditionalInfo DEFAULT N'',
    UpdatedAt          DATETIME2(0)   NOT NULL CONSTRAINT DF_ApplicantDetails_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE dbo.ApplicationKits (
    JobPostingId           INT            NOT NULL CONSTRAINT PK_ApplicationKits PRIMARY KEY
                                          CONSTRAINT FK_ApplicationKits_Job REFERENCES dbo.JobPostings (Id) ON DELETE CASCADE,
    CoverLetter            NVARCHAR(MAX)  NOT NULL,
    ResumeSummary          NVARCHAR(MAX)  NOT NULL,
    KeyPointsJson          NVARCHAR(MAX)  NOT NULL,
    -- [{ "question": "...", "answer": "..." }]
    ScreeningJson          NVARCHAR(MAX)  NOT NULL,
    -- [{ "keyword": "...", "suggestion": "..." }]
    KeywordGapsJson        NVARCHAR(MAX)  NOT NULL,
    RecruiterSubject       NVARCHAR(300)  NOT NULL,
    RecruiterMessage       NVARCHAR(MAX)  NOT NULL,
    Model                  NVARCHAR(100)  NOT NULL,
    GeneratedAt            DATETIME2(0)   NOT NULL CONSTRAINT DF_ApplicationKits_GeneratedAt DEFAULT SYSUTCDATETIME(),
    EditedAt               DATETIME2(0)   NULL
);
GO

CREATE TABLE dbo.Applications (
    Id            INT IDENTITY   NOT NULL CONSTRAINT PK_Applications PRIMARY KEY,
    JobPostingId  INT            NOT NULL CONSTRAINT UQ_Applications_Job UNIQUE
                                 CONSTRAINT FK_Applications_Job REFERENCES dbo.JobPostings (Id),
    Status        NVARCHAR(20)   NOT NULL CONSTRAINT DF_Applications_Status DEFAULT N'applied'
                                 CONSTRAINT CK_Applications_Status CHECK (Status IN (N'applied', N'screening', N'interview', N'offer', N'rejected', N'withdrawn')),
    AppliedOn     DATE           NOT NULL,
    Method        NVARCHAR(50)   NOT NULL,
    AppliedUrl    NVARCHAR(2000) NULL,
    Notes         NVARCHAR(MAX)  NULL,
    CreatedAt     DATETIME2(0)   NOT NULL CONSTRAINT DF_Applications_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt     DATETIME2(0)   NOT NULL CONSTRAINT DF_Applications_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO

-- Timeline for the application status page (applied, recruiter call, interview, outcome...).
CREATE TABLE dbo.ApplicationEvents (
    Id             INT IDENTITY   NOT NULL CONSTRAINT PK_ApplicationEvents PRIMARY KEY,
    ApplicationId  INT            NOT NULL CONSTRAINT FK_ApplicationEvents_Application REFERENCES dbo.Applications (Id) ON DELETE CASCADE,
    EventOn        DATE           NOT NULL,
    Kind           NVARCHAR(30)   NOT NULL,
    Note           NVARCHAR(MAX)  NULL,
    CreatedAt      DATETIME2(0)   NOT NULL CONSTRAINT DF_ApplicationEvents_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO
