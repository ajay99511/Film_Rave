-- Switch identity from phone-OTP (+ legacy email/password) to Google OAuth.
-- Note: this makes users.email NOT NULL and adds a unique google_id, so it is
-- intended to run on a fresh/reset database (see docs/DRY_RUN.md → prisma migrate reset).

-- DropTable (phone-OTP challenges are gone)
DROP TABLE IF EXISTS "otp_challenges";

-- AlterTable: drop the old identity columns, add the Google ones
ALTER TABLE "users" DROP COLUMN IF EXISTS "phone";
ALTER TABLE "users" DROP COLUMN IF EXISTS "password_hash";

ALTER TABLE "users" ADD COLUMN "google_id" TEXT;
ALTER TABLE "users" ADD COLUMN "avatar_url" TEXT;

-- Email becomes the required, unique identity
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;

-- Uniqueness for the new identity column
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");
