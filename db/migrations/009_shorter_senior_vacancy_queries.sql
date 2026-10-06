-- Tested 2026-10-06: the three-way OR senior queries timed out (over 60 s) in Chandigarh and Mohali, while
-- "senior .NET developer in Mohali" answered in 4 s with senior postings the plain query missed.

UPDATE dbo.VacancyQueries SET QueryText = N'senior .NET developer'
 WHERE Stack = N'dotnet' AND QueryText = N'senior .NET developer OR .NET technical lead OR .NET architect';
GO
