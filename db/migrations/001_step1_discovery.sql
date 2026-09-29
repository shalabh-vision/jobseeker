-- Step 1: profile, search criteria, job discovery and fetch runs.

CREATE TABLE dbo.AppSettings (
    [Key]      NVARCHAR(100) NOT NULL CONSTRAINT PK_AppSettings PRIMARY KEY,
    [Value]    NVARCHAR(MAX) NOT NULL,
    UpdatedAt  DATETIME2(0)  NOT NULL CONSTRAINT DF_AppSettings_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO

-- Single-row table holding the candidate's resume and the Gemini analysis of it.
CREATE TABLE dbo.Profile (
    Id              INT            NOT NULL CONSTRAINT PK_Profile PRIMARY KEY
                                   CONSTRAINT CK_Profile_Single CHECK (Id = 1),
    ResumeFileName  NVARCHAR(260)  NOT NULL,
    ResumeFile      VARBINARY(MAX) NOT NULL,
    ResumeText      NVARCHAR(MAX)  NOT NULL,
    AnalysisJson    NVARCHAR(MAX)  NULL CONSTRAINT CK_Profile_AnalysisJson CHECK (AnalysisJson IS NULL OR ISJSON(AnalysisJson) = 1),
    AnalysisModel   NVARCHAR(100)  NULL,
    AnalyzedAt      DATETIME2(0)   NULL,
    UploadedAt      DATETIME2(0)   NOT NULL CONSTRAINT DF_Profile_UploadedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE dbo.TargetLocations (
    Id        INT IDENTITY   NOT NULL CONSTRAINT PK_TargetLocations PRIMARY KEY,
    City      NVARCHAR(100)  NOT NULL CONSTRAINT UQ_TargetLocations_City UNIQUE,
    Region    NVARCHAR(100)  NOT NULL,
    -- Pipe-separated alternative spellings seen in job feeds, e.g. 'Gurgaon|Gurugram'
    Aliases   NVARCHAR(400)  NOT NULL CONSTRAINT DF_TargetLocations_Aliases DEFAULT N'',
    IsActive  BIT            NOT NULL CONSTRAINT DF_TargetLocations_IsActive DEFAULT 1
);
GO

INSERT dbo.TargetLocations (City, Region, Aliases) VALUES
    (N'Noida',      N'Delhi NCR',          N'Noida|Greater Noida|Gautam Buddha Nagar'),
    (N'Gurugram',   N'Delhi NCR',          N'Gurugram|Gurgaon'),
    (N'Delhi',      N'Delhi NCR',          N'Delhi|New Delhi'),
    (N'Chandigarh', N'Chandigarh Tricity', N'Chandigarh'),
    (N'Panchkula',  N'Chandigarh Tricity', N'Panchkula'),
    (N'Mohali',     N'Chandigarh Tricity', N'Mohali|SAS Nagar|Sahibzada Ajit Singh Nagar');
GO

CREATE TABLE dbo.SearchQueries (
    Id          INT IDENTITY   NOT NULL CONSTRAINT PK_SearchQueries PRIMARY KEY,
    RoleTitle   NVARCHAR(200)  NOT NULL,
    Keywords    NVARCHAR(400)  NOT NULL CONSTRAINT DF_SearchQueries_Keywords DEFAULT N'',
    City        NVARCHAR(100)  NOT NULL,
    Origin      NVARCHAR(20)   NOT NULL CONSTRAINT CK_SearchQueries_Origin CHECK (Origin IN (N'ai', N'user')),
    Rationale   NVARCHAR(1000) NULL,
    IsActive    BIT            NOT NULL CONSTRAINT DF_SearchQueries_IsActive DEFAULT 1,
    LastRunAt   DATETIME2(0)   NULL,
    CreatedAt   DATETIME2(0)   NOT NULL CONSTRAINT DF_SearchQueries_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_SearchQueries_RoleCity UNIQUE (RoleTitle, City)
);
GO

-- Employers or phrases the user never wants to see again (fed by reject reasons).
CREATE TABLE dbo.BlockRules (
    Id         INT IDENTITY   NOT NULL CONSTRAINT PK_BlockRules PRIMARY KEY,
    Kind       NVARCHAR(20)   NOT NULL CONSTRAINT CK_BlockRules_Kind CHECK (Kind IN (N'employer', N'keyword')),
    [Value]    NVARCHAR(200)  NOT NULL,
    Note       NVARCHAR(500)  NULL,
    CreatedAt  DATETIME2(0)   NOT NULL CONSTRAINT DF_BlockRules_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_BlockRules UNIQUE (Kind, [Value])
);
GO

CREATE TABLE dbo.FetchRuns (
    Id                    INT IDENTITY   NOT NULL CONSTRAINT PK_FetchRuns PRIMARY KEY,
    [Trigger]             NVARCHAR(20)   NOT NULL CONSTRAINT CK_FetchRuns_Trigger CHECK ([Trigger] IN (N'manual', N'scheduled')),
    Status                NVARCHAR(20)   NOT NULL CONSTRAINT CK_FetchRuns_Status CHECK (Status IN (N'running', N'succeeded', N'partial', N'failed')),
    StartedAt             DATETIME2(0)   NOT NULL CONSTRAINT DF_FetchRuns_StartedAt DEFAULT SYSUTCDATETIME(),
    FinishedAt            DATETIME2(0)   NULL,
    QueriesRun            INT            NOT NULL CONSTRAINT DF_FetchRuns_QueriesRun DEFAULT 0,
    ApiRequestsUsed       INT            NOT NULL CONSTRAINT DF_FetchRuns_ApiRequestsUsed DEFAULT 0,
    ApiRequestsRemaining  INT            NULL,
    JobsReturned          INT            NOT NULL CONSTRAINT DF_FetchRuns_JobsReturned DEFAULT 0,
    JobsNew               INT            NOT NULL CONSTRAINT DF_FetchRuns_JobsNew DEFAULT 0,
    JobsDuplicate         INT            NOT NULL CONSTRAINT DF_FetchRuns_JobsDuplicate DEFAULT 0,
    JobsFiltered          INT            NOT NULL CONSTRAINT DF_FetchRuns_JobsFiltered DEFAULT 0,
    JobsScored            INT            NOT NULL CONSTRAINT DF_FetchRuns_JobsScored DEFAULT 0,
    ErrorText             NVARCHAR(MAX)  NULL,
    LogText               NVARCHAR(MAX)  NULL
);
GO

CREATE TABLE dbo.JobPostings (
    Id                INT IDENTITY    NOT NULL CONSTRAINT PK_JobPostings PRIMARY KEY,
    Source            NVARCHAR(30)    NOT NULL,
    ExternalId        NVARCHAR(300)   NOT NULL,
    -- SHA-256 of normalised employer + title + city; same key = same job seen on another board.
    DedupeKey         CHAR(64)        NOT NULL,
    DuplicateOfId     INT             NULL CONSTRAINT FK_JobPostings_DuplicateOf REFERENCES dbo.JobPostings (Id),
    Title             NVARCHAR(400)   NOT NULL,
    EmployerName      NVARCHAR(300)   NOT NULL,
    EmployerWebsite   NVARCHAR(1000)  NULL,
    EmployerLogo      NVARCHAR(1000)  NULL,
    City              NVARCHAR(100)   NULL,
    State             NVARCHAR(100)   NULL,
    Country           NVARCHAR(10)    NULL,
    IsRemote          BIT             NOT NULL CONSTRAINT DF_JobPostings_IsRemote DEFAULT 0,
    EmploymentType    NVARCHAR(100)   NULL,
    PostedAt          DATETIME2(0)    NULL,
    Publisher         NVARCHAR(200)   NULL,
    ApplyLink         NVARCHAR(2000)  NULL,
    ApplyIsDirect     BIT             NULL,
    ApplyOptionsJson  NVARCHAR(MAX)   NULL,
    GoogleLink        NVARCHAR(2000)  NULL,
    Description       NVARCHAR(MAX)   NOT NULL,
    HighlightsJson    NVARCHAR(MAX)   NULL,
    SalaryMin         DECIMAL(14, 2)  NULL,
    SalaryMax         DECIMAL(14, 2)  NULL,
    SalaryPeriod      NVARCHAR(20)    NULL,
    SalaryText        NVARCHAR(200)   NULL,
    RawJson           NVARCHAR(MAX)   NOT NULL,
    SearchQueryId     INT             NULL CONSTRAINT FK_JobPostings_SearchQuery REFERENCES dbo.SearchQueries (Id) ON DELETE SET NULL,
    FetchRunId        INT             NOT NULL CONSTRAINT FK_JobPostings_FetchRun REFERENCES dbo.FetchRuns (Id),
    FirstSeenAt       DATETIME2(0)    NOT NULL CONSTRAINT DF_JobPostings_FirstSeenAt DEFAULT SYSUTCDATETIME(),
    LastSeenAt        DATETIME2(0)    NOT NULL CONSTRAINT DF_JobPostings_LastSeenAt DEFAULT SYSUTCDATETIME(),
    -- new = awaiting review, filtered = removed by a rule or low score, approved/rejected = user decision
    Status            NVARCHAR(20)    NOT NULL CONSTRAINT CK_JobPostings_Status CHECK (Status IN (N'new', N'filtered', N'approved', N'rejected')),
    FilterStage       NVARCHAR(30)    NULL,
    FilterReason      NVARCHAR(1000)  NULL,
    FitScore          TINYINT         NULL,
    FitSummary        NVARCHAR(2000)  NULL,
    FitReasonsJson    NVARCHAR(MAX)   NULL,
    RedFlagsJson      NVARCHAR(MAX)   NULL,
    ScoreModel        NVARCHAR(100)   NULL,
    ScoredAt          DATETIME2(0)    NULL,
    RejectReason      NVARCHAR(1000)  NULL,
    DecidedAt         DATETIME2(0)    NULL,
    CONSTRAINT UQ_JobPostings_SourceExternal UNIQUE (Source, ExternalId)
);
GO

CREATE INDEX IX_JobPostings_DedupeKey ON dbo.JobPostings (DedupeKey);
CREATE INDEX IX_JobPostings_Status ON dbo.JobPostings (Status, FitScore DESC) INCLUDE (PostedAt);
GO

INSERT dbo.AppSettings ([Key], [Value]) VALUES
    (N'fetch.maxRequestsPerRun', N'6'),
    (N'fetch.datePosted',        N'week'),
    (N'filter.maxAgeDays',       N'30'),
    (N'filter.minFitScore',      N'55');
GO
