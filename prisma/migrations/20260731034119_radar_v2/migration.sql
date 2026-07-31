-- Radar v2 schema.
--
-- Written defensively rather than as a plain diff. A deployment hit
-- "relation Company does not exist" here because the target database had the
-- init migration recorded as applied without its tables actually being
-- present. A migration that assumes an exact prior state cannot recover from
-- that; this one converges to the correct schema from any partial state and is
-- safe to run more than once.

-- ---------------------------------------------------------------- base tables
-- Normally created by 20260106171436_init. Recreated here only when missing.

CREATE TABLE IF NOT EXISTS "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "hq" TEXT,
    "stage" TEXT,
    "tags" TEXT,
    "atsType" TEXT,
    "atsKey" TEXT,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Job" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceJobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "remote" BOOLEAN NOT NULL DEFAULT false,
    "team" TEXT,
    "url" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "matchedTypes" TEXT,
    "seniority" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Note" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "jobId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Company_name_key" ON "Company"("name");
CREATE INDEX IF NOT EXISTS "Job_companyId_idx" ON "Job"("companyId");
CREATE INDEX IF NOT EXISTS "Job_postedAt_idx" ON "Job"("postedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Job_source_sourceJobId_key" ON "Job"("source", "sourceJobId");

-- ------------------------------------------------------------- new v2 columns

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "disabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "applyMethod" TEXT NOT NULL DEFAULT 'assisted';
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "applyUrl" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "atsBoardKey" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "score" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "track" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "usa" BOOLEAN NOT NULL DEFAULT true;

-- -------------------------------------------------------------- new v2 tables

CREATE TABLE IF NOT EXISTS "Resume" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "track" TEXT NOT NULL DEFAULT 'any',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Profile" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "linkedin" TEXT NOT NULL DEFAULT '',
    "github" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "workAuth" TEXT NOT NULL DEFAULT '',
    "needsSponsor" BOOLEAN NOT NULL DEFAULT false,
    "usAuthorized" BOOLEAN NOT NULL DEFAULT true,
    "gender" TEXT NOT NULL DEFAULT '',
    "race" TEXT NOT NULL DEFAULT '',
    "veteran" TEXT NOT NULL DEFAULT '',
    "disability" TEXT NOT NULL DEFAULT '',
    "coverLetter" TEXT NOT NULL DEFAULT '',
    "customAnswers" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Application" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "resumeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "method" TEXT NOT NULL DEFAULT 'assisted',
    "error" TEXT,
    "detail" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- ------------------------------------------------------------------- indexes

CREATE INDEX IF NOT EXISTS "Resume_track_idx" ON "Resume"("track");
CREATE UNIQUE INDEX IF NOT EXISTS "Application_jobId_key" ON "Application"("jobId");
CREATE INDEX IF NOT EXISTS "Application_status_idx" ON "Application"("status");
CREATE INDEX IF NOT EXISTS "Application_createdAt_idx" ON "Application"("createdAt");
CREATE INDEX IF NOT EXISTS "Job_track_active_postedAt_idx" ON "Job"("track", "active", "postedAt");
CREATE INDEX IF NOT EXISTS "Job_score_idx" ON "Job"("score");

-- --------------------------------------------------------------- foreign keys
-- ADD CONSTRAINT has no IF NOT EXISTS, so each one is guarded by name.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Job_companyId_fkey') THEN
    ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Note_companyId_fkey') THEN
    ALTER TABLE "Note" ADD CONSTRAINT "Note_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Note_jobId_fkey') THEN
    ALTER TABLE "Note" ADD CONSTRAINT "Note_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Application_jobId_fkey') THEN
    ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Application_resumeId_fkey') THEN
    ALTER TABLE "Application" ADD CONSTRAINT "Application_resumeId_fkey"
      FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
