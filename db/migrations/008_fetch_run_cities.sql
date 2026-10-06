-- Runs started from the Vacancies page search only the picked cities; they must not reset the weekly schedule.

ALTER TABLE dbo.FetchRuns ADD
    -- Comma-separated cities when the run searched only those cities' vacancy queries; NULL = a full fetch
    CitiesOnly  NVARCHAR(400)  NULL;
GO
