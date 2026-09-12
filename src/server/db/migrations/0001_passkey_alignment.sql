ALTER TABLE "passkey" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "passkey" ADD COLUMN "aaguid" text;--> statement-breakpoint
ALTER TABLE "passkey" DROP COLUMN "updated_at";