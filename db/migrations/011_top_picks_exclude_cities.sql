-- TOP 25 leaves out jobs in these cities (user, 2026-10-06: no Surat or Hyderabad companies).
-- Pipe-separated, matched against the posting's city; Secunderabad is Hyderabad's twin city.

INSERT dbo.AppSettings ([Key], [Value]) VALUES
    (N'topPicks.excludeCities', N'Surat|Hyderabad|Secunderabad');
GO
