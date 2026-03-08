import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function createProcedure(sql: string) {
  const escapedSql = sql.replace(/'/g, "''")
  await prisma.$executeRawUnsafe(`EXEC(N'${escapedSql}')`)
}

async function main() {
  await prisma.notification.deleteMany()
  await prisma.patientQueue.deleteMany()
  await prisma.clinic.deleteMany()

  await prisma.clinic.createMany({
    data: [
      { name: 'Waterloo Walk-in', location: '5km', totalWaitCount: 0, avgConsultTimeMinutes: 7 },
      { name: 'KW Urgent Care', location: '3km', totalWaitCount: 0, avgConsultTimeMinutes: 7 },
      { name: 'King St. Medical', location: '4km', totalWaitCount: 0, avgConsultTimeMinutes: 7 },
      { name: 'University Clinic', location: '1km', totalWaitCount: 0, avgConsultTimeMinutes: 7 },
      { name: 'Uptown Health', location: '6km', totalWaitCount: 0, avgConsultTimeMinutes: 7 },
    ],
  })

  await createProcedure(`
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
  `)

  await createProcedure(`
    CREATE PROCEDURE dbo.usp_SendRank3Alert
      @ClinicID INT
    AS
    BEGIN
      SET NOCOUNT ON;
      DECLARE @TargetPatient NVARCHAR(50);

      SELECT @TargetPatient = PatientName
      FROM (
        SELECT PatientName,
               ROW_NUMBER() OVER (ORDER BY CreatedAt ASC) AS Rank
        FROM dbo.PatientQueue
        WHERE ClinicID = @ClinicID AND Status = 'Waiting'
      ) ranked
      WHERE Rank = 3;

      IF @TargetPatient IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM dbo.Notifications
        WHERE PatientName = @TargetPatient
          AND ClinicID = @ClinicID
          AND Rank = 3
      )
      BEGIN
        INSERT INTO dbo.Notifications (PatientName, ClinicID, Rank, Message, SentAt, IsDelivered)
        VALUES (
          @TargetPatient,
          @ClinicID,
          3,
          CONCAT(@TargetPatient, ', it''s almost your turn! Please wait inside the clinic.'),
          GETDATE(),
          0
        );
      END
    END;
  `)

  console.log('Seed complete: clinics and queue procedures loaded.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
