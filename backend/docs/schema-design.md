The Prisma schema defines a relational database structure with foreign key relationships between models, but it is not fully relational due to intentional denormalization to accommodate CSV import data. Key denormalized fields include courtName (stored as a string in Case instead of exclusively via foreign key), judge1 through judge7 (stored as strings in CaseActivity instead of normalized relations), and parties (stored as a JSON string in Case instead of a separate Party model). This design prioritizes import efficiency over strict normalization, violating 3NF principles by storing redundant or derived data.

Only Case records are being persisted during CSV imports because the import logic (importService.ts) exclusively creates Case and CaseType entities from CSV data, while lookup tables like Court, Judge, User, and DailyImportBatch are not populated during imports—they are only seeded via seed.ts. This results in incomplete relational integrity, as Case records reference required foreign keys (e.g., caseTypeId) that are created on-the-fly, but optional or denormalized fields remain unlinked.

Detailed Breakdown of Current Relationships
Court:
One-to-many with Case via originalCourt (optional foreign key originalCourtId in Case).
Judge:
One-to-many with CaseActivity via primaryJudge (required foreign key primaryJudgeId in CaseActivity).
One-to-many with CaseJudgeAssignment (composite primary key on caseId and judgeId).
CaseType:
One-to-many with Case (required foreign key caseTypeId in Case).
Case:
Many-to-one with CaseType (required).
Many-to-one with Court via originalCourt (optional).
One-to-many with CaseActivity.
One-to-many with CaseJudgeAssignment.
CaseActivity:
Many-to-one with Case (required, with cascade delete).
Many-to-one with DailyImportBatch (required).
Many-to-one with Judge via primaryJudge (required).
CaseJudgeAssignment:
Many-to-one with Case (required, with cascade delete).
Many-to-one with Judge (required).
DailyImportBatch:
Many-to-one with User (required).
One-to-many with CaseActivity.
One-to-many with ImportErrorDetail.
User:
One-to-many with DailyImportBatch.
ImportErrorDetail:
Many-to-one with DailyImportBatch (required, with cascade delete).

Party Model:

id (UUID, PK)
caseId (FK to Case)
name (string, nullable)
type (enum: APPLICANT, DEFENDANT)
gender (enum: MALE, FEMALE, ORGANIZATION, nullable)
createdAt, updatedAt
Relation: case (1-to-many from Case)
Updated Case Model:

Remove courtName string field
Add courtId (FK to Court, required)
Remove parties JSON field
Add parties relation (1-to-many to Party)
Update unique constraint from (caseNumber, courtName) to (caseNumber, courtId)
Updated CaseActivity Model:

Remove judge1 to judge7 string fields
Add judge2Id to judge7Id (optional FKs to Judge)
Keep primaryJudgeId as is
CSV Import Logic Changes
Court Population: During import, parse court field from CSV; create Court entity if not exists (using courtName as courtName, derive courtCode from name, set default courtType).
Judge Population: For CaseActivity rows, parse judge1-judge7 fields; create Judge entities if not exists (using fullName, split into first/last if possible).
Party Population: Parse parties JSON or CSV fields (maleApplicant, etc.); create Party entities for each case with appropriate type and gender.
Import Service Updates: Modify processCsvFile in ImportService to collect unique courts/judges, create them before processing cases/activities; update case creation to use courtId and create parties.
Transaction Handling: Ensure all related entity creation happens within the same transaction as case import.
Migration Steps