-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('admin', 'member');

-- CreateEnum
CREATE TYPE "RatingsShared" AS ENUM ('none', 'approved', 'selective');

-- CreateEnum
CREATE TYPE "RelationshipStatus" AS ENUM ('friends', 'requested_by_me', 'requested_by_them', 'none');

-- CreateEnum
CREATE TYPE "RatingSource" AS ENUM ('app', 'imdb', 'letterboxd');

-- CreateEnum
CREATE TYPE "OutingStatus" AS ENUM ('planned', 'done');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('going', 'maybe', 'cant_go');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('rsvp_change', 'tickets_on_sale', 'outing_reminder', 'chat_message', 'friend_request', 'rating_imported');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "password_hash" TEXT,
    "avatar_color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circle_members" (
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'member',
    "ratings_shared" "RatingsShared" NOT NULL DEFAULT 'none',
    "shared_movie_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],

    CONSTRAINT "circle_members_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateTable
CREATE TABLE "friendships" (
    "user_id" TEXT NOT NULL,
    "other_id" TEXT NOT NULL,
    "status" "RelationshipStatus" NOT NULL,

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("user_id","other_id")
);

-- CreateTable
CREATE TABLE "movies" (
    "tmdb_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "release_date" TEXT NOT NULL,
    "overview" TEXT,
    "poster_url" TEXT,
    "runtime" INTEGER,
    "year" INTEGER,

    CONSTRAINT "movies_pkey" PRIMARY KEY ("tmdb_id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "user_id" TEXT NOT NULL,
    "movie_tmdb_id" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "rated_at" TIMESTAMP(3) NOT NULL,
    "source" "RatingSource" NOT NULL DEFAULT 'app',

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("user_id","movie_tmdb_id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "message_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "movie_tmdb_id" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "watchlist_entries" (
    "user_id" TEXT NOT NULL,
    "movie_tmdb_id" INTEGER NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_entries_pkey" PRIMARY KEY ("user_id","movie_tmdb_id")
);

-- CreateTable
CREATE TABLE "outings" (
    "outing_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "movie_tmdb_id" INTEGER NOT NULL,
    "status" "OutingStatus" NOT NULL DEFAULT 'planned',
    "tickets_on_sale_date" TEXT,

    CONSTRAINT "outings_pkey" PRIMARY KEY ("outing_id")
);

-- CreateTable
CREATE TABLE "outing_hypes" (
    "outing_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "outing_hypes_pkey" PRIMARY KEY ("outing_id","user_id")
);

-- CreateTable
CREATE TABLE "night_votes" (
    "outing_id" TEXT NOT NULL,
    "option_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "voter_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "night_votes_pkey" PRIMARY KEY ("outing_id","option_id")
);

-- CreateTable
CREATE TABLE "outing_rsvps" (
    "outing_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "RsvpStatus" NOT NULL,

    CONSTRAINT "outing_rsvps_pkey" PRIMARY KEY ("outing_id","user_id")
);

-- CreateTable
CREATE TABLE "theater_votes" (
    "outing_id" TEXT NOT NULL,
    "option_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "voter_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "theater_votes_pkey" PRIMARY KEY ("outing_id","option_id")
);

-- CreateTable
CREATE TABLE "group_watches" (
    "group_id" TEXT NOT NULL,
    "movie_tmdb_id" INTEGER NOT NULL,
    "watched_date" TEXT NOT NULL,

    CONSTRAINT "group_watches_pkey" PRIMARY KEY ("group_id","movie_tmdb_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_handle_key" ON "users"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "otp_challenges_phone_created_at_idx" ON "otp_challenges"("phone", "created_at");

-- CreateIndex
CREATE INDEX "chat_messages_group_id_movie_tmdb_id_sent_at_idx" ON "chat_messages"("group_id", "movie_tmdb_id", "sent_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle_members" ADD CONSTRAINT "circle_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_other_id_fkey" FOREIGN KEY ("other_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_movie_tmdb_id_fkey" FOREIGN KEY ("movie_tmdb_id") REFERENCES "movies"("tmdb_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_entries" ADD CONSTRAINT "watchlist_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_entries" ADD CONSTRAINT "watchlist_entries_movie_tmdb_id_fkey" FOREIGN KEY ("movie_tmdb_id") REFERENCES "movies"("tmdb_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outings" ADD CONSTRAINT "outings_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outing_hypes" ADD CONSTRAINT "outing_hypes_outing_id_fkey" FOREIGN KEY ("outing_id") REFERENCES "outings"("outing_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outing_hypes" ADD CONSTRAINT "outing_hypes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "night_votes" ADD CONSTRAINT "night_votes_outing_id_fkey" FOREIGN KEY ("outing_id") REFERENCES "outings"("outing_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outing_rsvps" ADD CONSTRAINT "outing_rsvps_outing_id_fkey" FOREIGN KEY ("outing_id") REFERENCES "outings"("outing_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outing_rsvps" ADD CONSTRAINT "outing_rsvps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theater_votes" ADD CONSTRAINT "theater_votes_outing_id_fkey" FOREIGN KEY ("outing_id") REFERENCES "outings"("outing_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_watches" ADD CONSTRAINT "group_watches_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
