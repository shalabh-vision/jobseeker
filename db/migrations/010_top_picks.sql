-- Vacancies > TOP 25 (first named TOP 20 FOR ME): India-wide searches for the profile's roles, a job-quality and landing-chance score
-- for postings that pass your rules, and company facts from Wikidata.

-- Run only from the button on the TOP 25 page (about one JSearch request each), never by the weekly fetch.
CREATE TABLE dbo.TopPickQueries (
    Id         INT IDENTITY   NOT NULL CONSTRAINT PK_TopPickQueries PRIMARY KEY,
    QueryText  NVARCHAR(300)  NOT NULL,
    -- india = "<QueryText> in India"; remote = work-from-home search anywhere in India
    WorkMode   NVARCHAR(20)   NOT NULL CONSTRAINT CK_TopPickQueries_WorkMode CHECK (WorkMode IN (N'india', N'remote')),
    IsActive   BIT            NOT NULL CONSTRAINT DF_TopPickQueries_IsActive DEFAULT 1,
    LastRunAt  DATETIME2(0)   NULL,
    CONSTRAINT UQ_TopPickQueries UNIQUE (QueryText, WorkMode)
);
GO

-- From the resume analysis' suitable roles (strong fits first). Short queries: long OR queries time out (2026-10-06).
INSERT dbo.TopPickQueries (QueryText, WorkMode) VALUES
    (N'Principal Software Architect', N'india'),
    (N'Technical Lead .NET',          N'india'),
    (N'Solutions Architect Azure',    N'india'),
    (N'AI Solutions Architect',       N'india'),
    (N'Engineering Manager .NET',     N'india'),
    (N'Principal Software Architect', N'remote'),
    (N'Solutions Architect',          N'remote'),
    (N'Technical Lead .NET',          N'remote');
GO

ALTER TABLE dbo.JobPostings ADD
    TopPickQueryId  INT            NULL CONSTRAINT FK_JobPostings_TopPickQuery REFERENCES dbo.TopPickQueries (Id) ON DELETE SET NULL,
    -- 0-100: how good the job is (description, pay as stated, work-life as stated, scope, employer)
    QualityScore    TINYINT        NULL,
    -- 0-100: how likely you are to land it, allowing for reasonable extra preparation
    LandingChance   TINYINT        NULL,
    -- Details behind both scores: pay, work mode, perks, employer type, highlights, gaps with effort
    QualityJson     NVARCHAR(MAX)  NULL CONSTRAINT CK_JobPostings_QualityJson CHECK (QualityJson IS NULL OR ISJSON(QualityJson) = 1),
    QualityModel    NVARCHAR(100)  NULL,
    QualityAt       DATETIME2(0)   NULL;
GO

-- Wikidata facts per employer (normalised name); WikidataId NULL = looked up, no company entry found.
CREATE TABLE dbo.CompanyFacts (
    EmployerKey  NVARCHAR(300)  NOT NULL CONSTRAINT PK_CompanyFacts PRIMARY KEY,
    WikidataId   NVARCHAR(20)   NULL,
    Label        NVARCHAR(300)  NULL,
    Description  NVARCHAR(500)  NULL,
    Employees    INT            NULL,
    Founded      SMALLINT       NULL,
    Industries   NVARCHAR(500)  NULL,
    Country      NVARCHAR(100)  NULL,
    CheckedAt    DATETIME2(0)   NOT NULL CONSTRAINT DF_CompanyFacts_CheckedAt DEFAULT SYSUTCDATETIME()
);
GO
