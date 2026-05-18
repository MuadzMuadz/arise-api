-- CreateEnum
CREATE TYPE "gender" AS ENUM ('male', 'female', 'other');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(60) NOT NULL,
    "gender" "gender" NOT NULL,
    "birth_date" DATE NOT NULL,
    "height_cm" SMALLINT,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
    "locale" VARCHAR(16) NOT NULL DEFAULT 'id-ID',
    "hunter_title" VARCHAR(60),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
