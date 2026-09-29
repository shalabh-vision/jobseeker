-- Recruiter / company contacts and scheduled interviews for each application.

CREATE TABLE dbo.ApplicationContacts (
    Id             INT IDENTITY   NOT NULL CONSTRAINT PK_ApplicationContacts PRIMARY KEY,
    ApplicationId  INT            NOT NULL CONSTRAINT FK_ApplicationContacts_Application REFERENCES dbo.Applications (Id) ON DELETE CASCADE,
    Name           NVARCHAR(200)  NOT NULL,
    Role           NVARCHAR(200)  NOT NULL CONSTRAINT DF_ApplicationContacts_Role DEFAULT N'',
    Email          NVARCHAR(200)  NOT NULL CONSTRAINT DF_ApplicationContacts_Email DEFAULT N'',
    Phone          NVARCHAR(50)   NOT NULL CONSTRAINT DF_ApplicationContacts_Phone DEFAULT N'',
    Notes          NVARCHAR(1000) NOT NULL CONSTRAINT DF_ApplicationContacts_Notes DEFAULT N'',
    CreatedAt      DATETIME2(0)   NOT NULL CONSTRAINT DF_ApplicationContacts_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE dbo.Interviews (
    Id             INT IDENTITY   NOT NULL CONSTRAINT PK_Interviews PRIMARY KEY,
    ApplicationId  INT            NOT NULL CONSTRAINT FK_Interviews_Application REFERENCES dbo.Applications (Id) ON DELETE CASCADE,
    Round          NVARCHAR(100)  NOT NULL,
    ScheduledAt    DATETIME2(0)   NOT NULL,
    Mode           NVARCHAR(20)   NOT NULL CONSTRAINT CK_Interviews_Mode CHECK (Mode IN (N'video', N'phone', N'in-person')),
    -- Meeting link or office address
    Location       NVARCHAR(1000) NOT NULL CONSTRAINT DF_Interviews_Location DEFAULT N'',
    Interviewers   NVARCHAR(500)  NOT NULL CONSTRAINT DF_Interviews_Interviewers DEFAULT N'',
    Notes          NVARCHAR(MAX)  NOT NULL CONSTRAINT DF_Interviews_Notes DEFAULT N'',
    Outcome        NVARCHAR(20)   NOT NULL CONSTRAINT DF_Interviews_Outcome DEFAULT N'pending'
                   CONSTRAINT CK_Interviews_Outcome CHECK (Outcome IN (N'pending', N'passed', N'failed', N'cancelled', N'awaiting')),
    CreatedAt      DATETIME2(0)   NOT NULL CONSTRAINT DF_Interviews_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_Interviews_ScheduledAt ON dbo.Interviews (ScheduledAt) INCLUDE (ApplicationId, Outcome);
GO
