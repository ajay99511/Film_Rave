-- CreateEnum
CREATE TYPE "CirclePrivacy" AS ENUM ('private', 'public');

-- AlterTable
ALTER TABLE "circles"
    ADD COLUMN "genre_focus" TEXT NOT NULL DEFAULT 'General / All Genres',
    ADD COLUMN "privacy" "CirclePrivacy" NOT NULL DEFAULT 'private',
    ADD COLUMN "banner_gradient" TEXT NOT NULL DEFAULT 'from-orange-600 via-amber-600 to-red-600';
