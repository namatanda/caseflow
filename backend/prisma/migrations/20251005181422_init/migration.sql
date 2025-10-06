-- CreateEnum
CREATE TYPE "CourtType" AS ENUM ('SC', 'ELC', 'ELRC', 'KC', 'SCC', 'COA', 'MC', 'HC', 'TC');

-- CreateEnum
CREATE TYPE "case_status" AS ENUM ('ACTIVE', 'RESOLVED', 'PENDING', 'TRANSFERRED', 'DELETED');

-- CreateEnum
CREATE TYPE "custody_status" AS ENUM ('IN_CUSTODY', 'ON_BAIL', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'DATA_ENTRY', 'VIEWER');

-- CreateEnum
CREATE TYPE "error_severity" AS ENUM ('ERROR', 'WARNING', 'INFO');

-- CreateTable
CREATE TABLE "courts" (
    "id" TEXT NOT NULL,
    "court_name" TEXT NOT NULL,
    "court_code" TEXT NOT NULL,
    "court_type" "CourtType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judges" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "judges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_types" (
    "id" TEXT NOT NULL,
    "case_type_name" TEXT NOT NULL,
    "case_type_code" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "case_number" TEXT NOT NULL,
    "court_name" TEXT NOT NULL,
    "original_court_id" TEXT,
    "case_type_id" TEXT NOT NULL,
    "filed_date" TIMESTAMP(3) NOT NULL,
    "original_case_number" TEXT,
    "original_year" INTEGER,
    "parties" TEXT NOT NULL,
    "status" "case_status" NOT NULL DEFAULT 'ACTIVE',
    "next_activity_date" TIMESTAMP(3),
    "total_activities" INTEGER NOT NULL DEFAULT 0,
    "has_legal_representation" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "caseid_type" TEXT,
    "caseid_no" TEXT,
    "male_applicant" INTEGER DEFAULT 0,
    "female_applicant" INTEGER DEFAULT 0,
    "organization_applicant" INTEGER DEFAULT 0,
    "male_defendant" INTEGER DEFAULT 0,
    "female_defendant" INTEGER DEFAULT 0,
    "organization_defendant" INTEGER DEFAULT 0,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_activities" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "activity_date" TIMESTAMP(3) NOT NULL,
    "activity_type" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason_for_adjournment" TEXT,
    "next_hearing_date" TIMESTAMP(3),
    "primary_judge_id" TEXT NOT NULL,
    "has_legal_representation" BOOLEAN NOT NULL,
    "applicant_witnesses" INTEGER NOT NULL DEFAULT 0,
    "defendant_witnesses" INTEGER NOT NULL DEFAULT 0,
    "custody_status" "custody_status" NOT NULL,
    "details" TEXT,
    "import_batch_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "judge_1" TEXT,
    "judge_2" TEXT,
    "judge_3" TEXT,
    "judge_4" TEXT,
    "judge_5" TEXT,
    "judge_6" TEXT,
    "judge_7" TEXT,
    "coming_for" TEXT,
    "legal_rep_string" TEXT,
    "custody_numeric" INTEGER,
    "other_details" TEXT,

    CONSTRAINT "case_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_judge_assignments" (
    "case_id" TEXT NOT NULL,
    "judge_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "case_judge_assignments_pkey" PRIMARY KEY ("case_id","judge_id")
);

-- CreateTable
CREATE TABLE "daily_import_batches" (
    "id" TEXT NOT NULL,
    "import_date" TIMESTAMP(3) NOT NULL,
    "filename" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_checksum" TEXT NOT NULL,
    "total_records" INTEGER NOT NULL,
    "successful_records" INTEGER NOT NULL,
    "failed_records" INTEGER NOT NULL,
    "error_logs" TEXT NOT NULL,
    "status" "import_status" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "estimated_completion_time" TIMESTAMP(3),
    "processing_start_time" TIMESTAMP(3),
    "user_config" TEXT NOT NULL DEFAULT '{}',
    "validation_warnings" TEXT NOT NULL DEFAULT '[]',
    "empty_rows_skipped" INTEGER DEFAULT 0,

    CONSTRAINT "daily_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'DATA_ENTRY',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_error_details" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "errorType" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "severity" "error_severity" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_error_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courts_court_code_key" ON "courts"("court_code");

-- CreateIndex
CREATE INDEX "courts_court_type_is_active_idx" ON "courts"("court_type", "is_active");

-- CreateIndex
CREATE INDEX "courts_court_name_idx" ON "courts"("court_name");

-- CreateIndex
CREATE INDEX "courts_court_code_idx" ON "courts"("court_code");

-- CreateIndex
CREATE INDEX "judges_full_name_idx" ON "judges"("full_name");

-- CreateIndex
CREATE INDEX "judges_first_name_last_name_idx" ON "judges"("first_name", "last_name");

-- CreateIndex
CREATE INDEX "judges_is_active_idx" ON "judges"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "case_types_case_type_code_key" ON "case_types"("case_type_code");

-- CreateIndex
CREATE INDEX "case_types_case_type_name_idx" ON "case_types"("case_type_name");

-- CreateIndex
CREATE INDEX "case_types_is_active_idx" ON "case_types"("is_active");

-- CreateIndex
CREATE INDEX "cases_status_filed_date_idx" ON "cases"("status", "filed_date" DESC);

-- CreateIndex
CREATE INDEX "cases_case_type_id_filed_date_idx" ON "cases"("case_type_id", "filed_date" DESC);

-- CreateIndex
CREATE INDEX "cases_filed_date_idx" ON "cases"("filed_date" DESC);

-- CreateIndex
CREATE INDEX "cases_case_number_idx" ON "cases"("case_number");

-- CreateIndex
CREATE INDEX "cases_court_name_idx" ON "cases"("court_name");

-- CreateIndex
CREATE INDEX "cases_status_idx" ON "cases"("status");

-- CreateIndex
CREATE INDEX "cases_next_activity_date_idx" ON "cases"("next_activity_date" DESC);

-- CreateIndex
CREATE INDEX "cases_male_applicant_idx" ON "cases"("male_applicant");

-- CreateIndex
CREATE INDEX "cases_female_applicant_idx" ON "cases"("female_applicant");

-- CreateIndex
CREATE INDEX "cases_male_defendant_idx" ON "cases"("male_defendant");

-- CreateIndex
CREATE INDEX "cases_female_defendant_idx" ON "cases"("female_defendant");

-- CreateIndex
CREATE INDEX "cases_organization_applicant_idx" ON "cases"("organization_applicant");

-- CreateIndex
CREATE INDEX "cases_organization_defendant_idx" ON "cases"("organization_defendant");

-- CreateIndex
CREATE UNIQUE INDEX "cases_case_number_court_name_key" ON "cases"("case_number", "court_name");

-- CreateIndex
CREATE INDEX "case_activities_case_id_activity_date_idx" ON "case_activities"("case_id", "activity_date" DESC);

-- CreateIndex
CREATE INDEX "case_activities_activity_date_idx" ON "case_activities"("activity_date" DESC);

-- CreateIndex
CREATE INDEX "case_activities_primary_judge_id_activity_date_idx" ON "case_activities"("primary_judge_id", "activity_date" DESC);

-- CreateIndex
CREATE INDEX "case_activities_outcome_activity_date_idx" ON "case_activities"("outcome", "activity_date" DESC);

-- CreateIndex
CREATE INDEX "case_activities_activity_type_idx" ON "case_activities"("activity_type");

-- CreateIndex
CREATE INDEX "case_activities_import_batch_id_idx" ON "case_activities"("import_batch_id");

-- CreateIndex
CREATE INDEX "case_activities_custody_status_idx" ON "case_activities"("custody_status");

-- CreateIndex
CREATE INDEX "case_activities_coming_for_idx" ON "case_activities"("coming_for");

-- CreateIndex
CREATE INDEX "case_activities_legal_rep_string_idx" ON "case_activities"("legal_rep_string");

-- CreateIndex
CREATE INDEX "case_activities_custody_numeric_idx" ON "case_activities"("custody_numeric");

-- CreateIndex
CREATE INDEX "case_activities_judge2_idx" ON "case_activities"("judge_2");

-- CreateIndex
CREATE INDEX "case_activities_judge3_idx" ON "case_activities"("judge_3");

-- CreateIndex
CREATE INDEX "case_activities_judge4_idx" ON "case_activities"("judge_4");

-- CreateIndex
CREATE INDEX "case_activities_judge5_idx" ON "case_activities"("judge_5");

-- CreateIndex
CREATE INDEX "case_activities_judge6_idx" ON "case_activities"("judge_6");

-- CreateIndex
CREATE INDEX "case_activities_judge7_idx" ON "case_activities"("judge_7");

-- CreateIndex
CREATE INDEX "case_judge_assignments_case_id_idx" ON "case_judge_assignments"("case_id");

-- CreateIndex
CREATE INDEX "case_judge_assignments_judge_id_idx" ON "case_judge_assignments"("judge_id");

-- CreateIndex
CREATE INDEX "case_judge_assignments_is_primary_idx" ON "case_judge_assignments"("is_primary");

-- CreateIndex
CREATE INDEX "daily_import_batches_import_date_idx" ON "daily_import_batches"("import_date" DESC);

-- CreateIndex
CREATE INDEX "daily_import_batches_status_idx" ON "daily_import_batches"("status");

-- CreateIndex
CREATE INDEX "daily_import_batches_created_by_idx" ON "daily_import_batches"("created_by");

-- CreateIndex
CREATE INDEX "daily_import_batches_filename_idx" ON "daily_import_batches"("filename");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE INDEX "import_error_details_batchId_idx" ON "import_error_details"("batchId");

-- CreateIndex
CREATE INDEX "import_error_details_rowNumber_idx" ON "import_error_details"("rowNumber");

-- CreateIndex
CREATE INDEX "import_error_details_severity_idx" ON "import_error_details"("severity");

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_case_type_id_fkey" FOREIGN KEY ("case_type_id") REFERENCES "case_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_original_court_id_fkey" FOREIGN KEY ("original_court_id") REFERENCES "courts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_activities" ADD CONSTRAINT "case_activities_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_activities" ADD CONSTRAINT "case_activities_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "daily_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_activities" ADD CONSTRAINT "case_activities_primary_judge_id_fkey" FOREIGN KEY ("primary_judge_id") REFERENCES "judges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_judge_assignments" ADD CONSTRAINT "case_judge_assignments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_judge_assignments" ADD CONSTRAINT "case_judge_assignments_judge_id_fkey" FOREIGN KEY ("judge_id") REFERENCES "judges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_import_batches" ADD CONSTRAINT "daily_import_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_error_details" ADD CONSTRAINT "import_error_details_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "daily_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
