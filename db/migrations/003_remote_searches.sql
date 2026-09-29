-- Optional remote / work-from-home searches, with industry preferences used when scoring results.

ALTER TABLE dbo.SavedSearches ADD
    -- onsite = office or hybrid in the target cities, remote = work from home anywhere in India
    WorkMode   NVARCHAR(20)  NOT NULL CONSTRAINT DF_SavedSearches_WorkMode DEFAULT N'onsite'
               CONSTRAINT CK_SavedSearches_WorkMode CHECK (WorkMode IN (N'onsite', N'remote')),
    -- Comma-separated industries to favour when scoring, e.g. 'online dating, video streaming'
    Industries NVARCHAR(400) NOT NULL CONSTRAINT DF_SavedSearches_Industries DEFAULT N'';
GO

-- Starts inactive: the user switches it on from the Searches page when wanted.
INSERT dbo.SavedSearches (RoleTitle, Keywords, Cities, Origin, Rationale, IsActive, WorkMode, Industries)
VALUES (N'Remote Senior Web Developer', N'React, Next.js, .NET, full stack', N'', N'user',
        N'Optional work-from-home search for web development roles.', 0, N'remote',
        N'online dating, adult entertainment, video streaming / OTT, media & entertainment');
GO
