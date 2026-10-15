-- Career insights (Profile > Career map, Employers, SWOT): computed on Refresh and kept here, so pages never call
-- Wikidata, the World Bank or Gemini on view. One row per kind ('cities', 'roles', 'employers', 'swot').

CREATE TABLE dbo.CareerInsights (
    Kind       NVARCHAR(30)   NOT NULL CONSTRAINT PK_CareerInsights PRIMARY KEY,
    DataJson   NVARCHAR(MAX)  NOT NULL CONSTRAINT CK_CareerInsights_DataJson CHECK (ISJSON(DataJson) = 1),
    -- Gemini model that wrote the text, NULL when the result is pure data
    Model      NVARCHAR(100)  NULL,
    UpdatedAt  DATETIME2(0)   NOT NULL CONSTRAINT DF_CareerInsights_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO
