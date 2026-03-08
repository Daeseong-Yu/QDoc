IF DB_ID('QDoc') IS NULL
BEGIN
    CREATE DATABASE QDoc;
END;
GO

USE QDoc;
GO

IF OBJECT_ID('dbo.PatientQueue', 'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.PatientQueue;
END;
GO

IF OBJECT_ID('dbo.Clinics', 'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.Clinics;
END;
GO

CREATE TABLE dbo.Clinics (
    ClinicID INT PRIMARY KEY IDENTITY(1,1),
    Name NVARCHAR(100),
    Location NVARCHAR(100),
    TotalWaitCount INT DEFAULT 0,
    AvgConsultTimeMinutes INT DEFAULT 7
);
GO

CREATE TABLE dbo.PatientQueue (
    QueueID INT PRIMARY KEY IDENTITY(1,1),
    ClinicID INT FOREIGN KEY REFERENCES dbo.Clinics(ClinicID),
    PatientName NVARCHAR(50),
    Status NVARCHAR(20) DEFAULT 'Waiting',
    CreatedAt DATETIME DEFAULT GETDATE()
);
GO

INSERT INTO dbo.Clinics (Name, Location, TotalWaitCount)
VALUES
('Waterloo Walk-in', '5km', 12),
('KW Urgent Care', '3km', 2),
('King St. Medical', '4km', 7),
('University Clinic', '1km', 15),
('Uptown Health', '6km', 5);
GO

IF OBJECT_ID('dbo.usp_JoinQueue', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE dbo.usp_JoinQueue;
END;
GO

CREATE PROCEDURE dbo.usp_JoinQueue
    @ClinicID INT,
    @PatientName NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRANSACTION;
        INSERT INTO dbo.PatientQueue (ClinicID, PatientName, Status)
        VALUES (@ClinicID, @PatientName, 'Waiting');

        UPDATE dbo.Clinics
        SET TotalWaitCount = TotalWaitCount + 1
        WHERE ClinicID = @ClinicID;
    COMMIT TRANSACTION;
END;
GO
