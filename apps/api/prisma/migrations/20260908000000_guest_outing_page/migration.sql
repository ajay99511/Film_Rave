-- F-06: guest-accessible shareable outing page.
-- Adds a public `slug` + `locked_at` to outings, a GuestRsvp identity table
-- for anonymous visitors, and a minimal append-only Event log for the
-- acquisition-loop funnel. All additive; safe to roll back by dropping the
-- new columns/tables.

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('outing_created', 'link_shared', 'guest_viewed', 'guest_rsvped', 'guest_converted');

-- Expand: add slug as nullable first (existing rows have none yet), plus locked_at.
ALTER TABLE "outings"
    ADD COLUMN "slug" TEXT,
    ADD COLUMN "locked_at" TIMESTAMP(3);

-- Backfill: generate an unguessable slug for any pre-existing outings (e.g.
-- seeded/dogfooding rows). One-time only; the application generates all
-- slugs for new outings going forward (12-char base62, see OutingsService).
UPDATE "outings"
SET "slug" = substr(md5(random()::text || clock_timestamp()::text || "outing_id"), 1, 12)
WHERE "slug" IS NULL;

-- Contract: slug is required and unique from here on.
ALTER TABLE "outings" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "outings_slug_key" ON "outings"("slug");

-- CreateTable
CREATE TABLE "guest_rsvps" (
    "outing_id" TEXT NOT NULL,
    "guest_token" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "RsvpStatus" NOT NULL,
    "voted_night_option_id" TEXT,
    "claimed_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_rsvps_pkey" PRIMARY KEY ("outing_id","guest_token")
);

-- CreateIndex
CREATE UNIQUE INDEX "guest_rsvps_guest_token_key" ON "guest_rsvps"("guest_token");

-- AddForeignKey
ALTER TABLE "guest_rsvps" ADD CONSTRAINT "guest_rsvps_outing_id_fkey" FOREIGN KEY ("outing_id") REFERENCES "outings"("outing_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_rsvps" ADD CONSTRAINT "guest_rsvps_claimed_by_user_id_fkey" FOREIGN KEY ("claimed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "outing_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_type_created_at_idx" ON "events"("type", "created_at");
