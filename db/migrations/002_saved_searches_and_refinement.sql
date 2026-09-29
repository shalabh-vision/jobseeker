-- Split "what the user wants" (SavedSearches) from "what is sent to JSearch" (SearchQueries,
-- produced by a Gemini refinement pass). SearchQueries from 001 held no data yet.

ALTER TABLE dbo.JobPostings DROP CONSTRAINT FK_JobPostings_SearchQuery;
DROP TABLE dbo.SearchQueries;
GO

CREATE TABLE dbo.SavedSearches (
    Id          INT IDENTITY   NOT NULL CONSTRAINT PK_SavedSearches PRIMARY KEY,
    RoleTitle   NVARCHAR(200)  NOT NULL CONSTRAINT UQ_SavedSearches_RoleTitle UNIQUE,
    -- Extra words that should shape the search, e.g. '.NET, Azure'
    Keywords    NVARCHAR(400)  NOT NULL CONSTRAINT DF_SavedSearches_Keywords DEFAULT N'',
    -- Pipe-separated TargetLocations.City values; empty = all active target cities
    Cities      NVARCHAR(400)  NOT NULL CONSTRAINT DF_SavedSearches_Cities DEFAULT N'',
    Origin      NVARCHAR(20)   NOT NULL CONSTRAINT CK_SavedSearches_Origin CHECK (Origin IN (N'ai', N'user')),
    Rationale   NVARCHAR(1000) NULL,
    IsActive    BIT            NOT NULL CONSTRAINT DF_SavedSearches_IsActive DEFAULT 1,
    CreatedAt   DATETIME2(0)   NOT NULL CONSTRAINT DF_SavedSearches_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt   DATETIME2(0)   NOT NULL CONSTRAINT DF_SavedSearches_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE dbo.QueryRefinements (
    Id          INT IDENTITY   NOT NULL CONSTRAINT PK_QueryRefinements PRIMARY KEY,
    Model       NVARCHAR(100)  NOT NULL,
    Budget      INT            NOT NULL,
    Summary     NVARCHAR(MAX)  NOT NULL,
    CreatedAt   DATETIME2(0)   NOT NULL CONSTRAINT DF_QueryRefinements_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE dbo.SearchQueries (
    Id            INT IDENTITY   NOT NULL CONSTRAINT PK_SearchQueries PRIMARY KEY,
    QueryText     NVARCHAR(300)  NOT NULL,
    -- 'Delhi NCR' or a TargetLocations.City; sent to JSearch as "<QueryText> in <Location>"
    Location      NVARCHAR(100)  NOT NULL,
    Priority      TINYINT        NOT NULL CONSTRAINT CK_SearchQueries_Priority CHECK (Priority BETWEEN 1 AND 3),
    Rationale     NVARCHAR(1000) NULL,
    -- ai = produced by refinement, user = added or edited by hand (kept across refinements)
    Origin        NVARCHAR(20)   NOT NULL CONSTRAINT CK_SearchQueries_Origin CHECK (Origin IN (N'ai', N'user')),
    -- active = runs on each fetch, paused = skipped, retired = replaced by a newer refinement (kept for stats)
    Status        NVARCHAR(20)   NOT NULL CONSTRAINT CK_SearchQueries_Status CHECK (Status IN (N'active', N'paused', N'retired')),
    RefinementId  INT            NULL CONSTRAINT FK_SearchQueries_Refinement REFERENCES dbo.QueryRefinements (Id),
    LastRunAt     DATETIME2(0)   NULL,
    CreatedAt     DATETIME2(0)   NOT NULL CONSTRAINT DF_SearchQueries_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE dbo.SearchQuerySources (
    SearchQueryId  INT NOT NULL CONSTRAINT FK_SearchQuerySources_Query REFERENCES dbo.SearchQueries (Id) ON DELETE CASCADE,
    SavedSearchId  INT NOT NULL CONSTRAINT FK_SearchQuerySources_Saved REFERENCES dbo.SavedSearches (Id) ON DELETE CASCADE,
    CONSTRAINT PK_SearchQuerySources PRIMARY KEY (SearchQueryId, SavedSearchId)
);
GO

ALTER TABLE dbo.JobPostings ADD CONSTRAINT FK_JobPostings_SearchQuery
    FOREIGN KEY (SearchQueryId) REFERENCES dbo.SearchQueries (Id) ON DELETE SET NULL;
GO

-- Fetch every 3 days: ~10 runs/month within the 200-request JSearch plan.
UPDATE dbo.AppSettings SET [Value] = N'18', UpdatedAt = SYSUTCDATETIME() WHERE [Key] = N'fetch.maxRequestsPerRun';
INSERT dbo.AppSettings ([Key], [Value]) VALUES (N'fetch.intervalDays', N'3');
GO
