-- Vacancies tab: cities, fixed per-stack queries run by the fetch, and a stack tag on each posting.

-- Cities the Vacancies tab covers. Separate from TargetLocations, which decide what Discover shows.
-- A section groups cities on the page (the three Tricity cities form one section).
CREATE TABLE dbo.VacancyCities (
    City       NVARCHAR(100)  NOT NULL CONSTRAINT PK_VacancyCities PRIMARY KEY,
    Section    NVARCHAR(100)  NOT NULL,
    -- JSearch country code
    Country    CHAR(2)        NOT NULL CONSTRAINT DF_VacancyCities_Country DEFAULT 'in',
    -- Pipe-separated spellings seen in job feeds (first match wins, so list specific names before broad ones)
    Aliases    NVARCHAR(400)  NOT NULL,
    -- Companies listed per section (the busiest recruiters first; search still finds the rest)
    TopCompanies INT          NOT NULL CONSTRAINT DF_VacancyCities_TopCompanies DEFAULT 10,
    -- 1 = searched by every fetch run; 0 = only when you pick the city on the Vacancies page (JSearch budget)
    AutoFetch  BIT            NOT NULL CONSTRAINT DF_VacancyCities_AutoFetch DEFAULT 0,
    SortOrder  INT            NOT NULL,
    IsActive   BIT            NOT NULL CONSTRAINT DF_VacancyCities_IsActive DEFAULT 1
);
GO

INSERT dbo.VacancyCities (City, Section, Country, Aliases, TopCompanies, AutoFetch, SortOrder) VALUES
    (N'Chandigarh',     N'Tricity',        'in', N'Chandigarh', 20, 1, 1),
    (N'Mohali',         N'Tricity',        'in', N'Mohali|SAS Nagar|Sahibzada Ajit Singh Nagar', 20, 1, 2),
    (N'Panchkula',      N'Tricity',        'in', N'Panchkula', 20, 1, 3),
    (N'Bengaluru',      N'Bengaluru',      'in', N'Bengaluru|Bangalore', 10, 0, 10),
    (N'Noida',          N'Noida',          'in', N'Noida|Greater Noida|Gautam Buddha Nagar', 10, 0, 11),
    (N'Gurugram',       N'Gurugram',       'in', N'Gurugram|Gurgaon', 10, 0, 12),
    (N'Delhi',          N'Delhi',          'in', N'Delhi|New Delhi', 10, 0, 13),
    (N'Kolkata',        N'Kolkata',        'in', N'Kolkata|Calcutta', 10, 0, 14),
    (N'Mumbai',         N'Mumbai',         'in', N'Mumbai|Navi Mumbai|Bombay', 10, 0, 15),
    (N'Mysuru',         N'Mysuru',         'in', N'Mysuru|Mysore', 10, 0, 16),
    (N'Bhubaneswar',    N'Bhubaneswar',    'in', N'Bhubaneswar|Bhubaneshwar', 10, 0, 17),
    (N'Goa',            N'Goa',            'in', N'Goa|Panaji|Panjim|Margao|Vasco da Gama', 10, 0, 18),
    -- Tested 2026-10-06: "<query> in Silicon Valley" with country=us returns San Jose, Sunnyvale, Santa Clara,
    -- San Mateo and San Francisco postings.
    (N'Silicon Valley', N'Silicon Valley', 'us', N'Silicon Valley|San Jose|Sunnyvale|Santa Clara|Mountain View|Palo Alto|Cupertino|Fremont|Milpitas|Redwood City|Menlo Park|San Mateo|Foster City|San Francisco', 10, 0, 30);
GO

CREATE TABLE dbo.VacancyQueries (
    Id         INT IDENTITY   NOT NULL CONSTRAINT PK_VacancyQueries PRIMARY KEY,
    -- dotnet, js, ai-ml, blockchain (matches the /vacancies/<stack> route)
    Stack      NVARCHAR(30)   NOT NULL,
    QueryText  NVARCHAR(300)  NOT NULL,
    -- Sent to JSearch as "<QueryText> in <City>"
    City       NVARCHAR(100)  NOT NULL CONSTRAINT FK_VacancyQueries_City REFERENCES dbo.VacancyCities (City) ON UPDATE CASCADE,
    IsActive   BIT            NOT NULL CONSTRAINT DF_VacancyQueries_IsActive DEFAULT 1,
    LastRunAt  DATETIME2(0)   NULL,
    CreatedAt  DATETIME2(0)   NOT NULL CONSTRAINT DF_VacancyQueries_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_VacancyQueries UNIQUE (Stack, QueryText, City)
);
GO

-- Tested 2026-10-06: page 1 of ".NET developer in Mohali" is almost all .NET postings, while pages 2-3 drift to
-- sales and React jobs and cost one request each. So several 1-page queries with different wording, not deeper pages.
-- Tricity queries run on every fetch (inside fetch.maxRequestsPerRun); other cities run when picked on the page.
INSERT dbo.VacancyQueries (Stack, QueryText, City) VALUES
    (N'dotnet', N'.NET developer', N'Mohali'),
    (N'dotnet', N'senior .NET developer OR .NET technical lead OR .NET architect', N'Mohali'),
    (N'dotnet', N'.NET developer', N'Chandigarh'),
    (N'dotnet', N'senior .NET developer OR .NET technical lead OR .NET architect', N'Chandigarh'),
    (N'dotnet', N'.NET developer OR C# developer', N'Panchkula'),
    (N'dotnet', N'.NET developer', N'Bengaluru'),
    (N'dotnet', N'.NET developer', N'Noida'),
    (N'dotnet', N'.NET developer', N'Gurugram'),
    (N'dotnet', N'.NET developer', N'Delhi'),
    (N'dotnet', N'.NET developer', N'Kolkata'),
    (N'dotnet', N'.NET developer', N'Mumbai'),
    (N'dotnet', N'.NET developer', N'Mysuru'),
    (N'dotnet', N'.NET developer', N'Bhubaneswar'),
    (N'dotnet', N'.NET developer', N'Goa'),
    (N'dotnet', N'.NET developer', N'Silicon Valley');
GO

ALTER TABLE dbo.JobPostings ADD
    -- Comma-wrapped stacks detected from the title and description, e.g. ',dotnet,'; '' = none, NULL = not tagged yet
    Stacks          NVARCHAR(200)  NULL,
    VacancyQueryId  INT            NULL CONSTRAINT FK_JobPostings_VacancyQuery REFERENCES dbo.VacancyQueries (Id) ON DELETE SET NULL;
GO

INSERT dbo.AppSettings ([Key], [Value]) VALUES
    -- Vacancy listings want everything still open, not just this week's postings
    (N'vacancies.datePosted', N'month');
GO

-- JSearch budget (user, 2026-10-06): the automatic fetch runs once a week.
UPDATE dbo.AppSettings SET [Value] = N'7', UpdatedAt = SYSUTCDATETIME() WHERE [Key] = N'fetch.intervalDays';
GO
