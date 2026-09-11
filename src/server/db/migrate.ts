import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

export interface MigrationOptions {
  connectionString?: string;
  migrationsFolder?: string;
}

/**
 * Programmatically runs pending Drizzle migrations.
 */
export async function runMigrations(options?: MigrationOptions): Promise<{ success: boolean }> {
  const connectionString =
    options?.connectionString ||
    process.env.DATABASE_URL ||
    "postgresql://lifeos:lifeos_password@localhost:5432/lifeos";

  const migrationsFolder =
    options?.migrationsFolder ||
    path.resolve(process.cwd(), "src/server/db/migrations");

  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  const db = drizzle(pool);

  console.log(`[db:migrate] Running migrations from: ${migrationsFolder}`);
  try {
    await migrate(db, { migrationsFolder });
    console.log("✔ [db:migrate] Migrations completed successfully.");
    return { success: true };
  } catch (error) {
    console.error("❌ [db:migrate] Migration execution failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Direct CLI execution check
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  runMigrations()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error(
        "\nPostgreSQL migration failed.\n" +
          "Ensure PostgreSQL is running and DATABASE_URL is accessible.\n" +
          "To start the local container: docker compose up -d postgres\n"
      );
      process.exit(1);
    });
}
