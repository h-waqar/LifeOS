import { db, closeDatabase } from "@/server/db";
import { user, account, session } from "@/server/db/schema/auth";
import { createAuditLog } from "@/server/audit";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import readline from "node:readline";

/**
 * Prompts user for console input.
 */
function promptUser(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

/**
 * CLI Emergency Account Recovery Script (Decision D-04)
 * Resets the primary user password and revokes all active sessions directly in PostgreSQL.
 */
export async function runAuthReset(options?: {
  email?: string;
  password?: string;
}): Promise<{ success: boolean; message: string; userId?: string }> {
  try {
    const existingUsers = await db.select().from(user);

    if (existingUsers.length === 0) {
      return {
        success: false,
        message: "No user found in the database. First create an account via /signup.",
      };
    }

    let targetEmail = options?.email ?? process.env.RESET_EMAIL;
    let targetPassword = options?.password ?? process.env.RESET_PASSWORD;

    // Check CLI arguments (--email, --password)
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--email" && args[i + 1]) {
        targetEmail = args[++i];
      } else if (args[i] === "--password" && args[i + 1]) {
        targetPassword = args[++i];
      }
    }

    // Interactive fallback if not supplied via options, env, or args
    if (!targetPassword) {
      if (process.stdin.isTTY) {
        if (!targetEmail) {
          targetEmail = await promptUser(
            `Enter account email (default: ${existingUsers[0].email}): `
          );
          if (!targetEmail) {
            targetEmail = existingUsers[0].email;
          }
        }
        targetPassword = await promptUser("Enter new password (min 8 chars): ");
      } else {
        return {
          success: false,
          message:
            "Password must be provided via --password argument or RESET_PASSWORD environment variable in non-interactive mode.",
        };
      }
    }

    if (!targetPassword || targetPassword.length < 8) {
      return {
        success: false,
        message: "Password must be at least 8 characters long.",
      };
    }

    const targetUser = targetEmail
      ? existingUsers.find((u) => u.email.toLowerCase() === targetEmail!.toLowerCase())
      : existingUsers[0];

    if (!targetUser) {
      return {
        success: false,
        message: `User with email "${targetEmail}" not found.`,
      };
    }

    console.log(`🔑 Resetting credentials for user: ${targetUser.email} (${targetUser.id})...`);

    // Hash password with Better Auth's standard hasher
    const hashedPassword = await hashPassword(targetPassword);

    let revokedCount = 0;

    // Execute credential update and session revocation atomically
    await db.transaction(async (tx) => {
      // Update or insert credential account
      const existingAccount = await tx
        .select()
        .from(account)
        .where(eq(account.userId, targetUser.id));

      const credentialAccount = existingAccount.find(
        (a) => a.providerId === "credential"
      );

      if (credentialAccount) {
        await tx
          .update(account)
          .set({
            password: hashedPassword,
            updatedAt: new Date(),
          })
          .where(eq(account.id, credentialAccount.id));
      } else {
        await tx.insert(account).values({
          id: crypto.randomUUID(),
          userId: targetUser.id,
          accountId: targetUser.id,
          providerId: "credential",
          password: hashedPassword,
        });
      }

      // Revoke all active sessions
      const deletedSessions = await tx
        .delete(session)
        .where(eq(session.userId, targetUser.id))
        .returning({ id: session.id });

      revokedCount = deletedSessions.length;
    });

    // Write security audit log
    await createAuditLog({
      userId: targetUser.id,
      category: "security",
      action: "auth.cli_reset",
      status: "success",
      actor: "cli:auth-reset",
      details: {
        revokedSessionCount: revokedCount,
      },
    });

    console.log(
      `✅ Password successfully reset. ${revokedCount} active sessions revoked.`
    );

    return {
      success: true,
      message: `Password reset successfully. ${revokedCount} sessions revoked.`,
      userId: targetUser.id,
    };
  } finally {
    if (process.env.NODE_ENV !== "test") {
      await closeDatabase();
    }
  }
}

// Execute directly if run via CLI
if (
  process.argv[1] &&
  (process.argv[1].endsWith("auth-reset.ts") ||
    process.argv[1].endsWith("auth-reset.js"))
) {
  runAuthReset()
    .then((res) => {
      if (!res.success) {
        console.error(`❌ ${res.message}`);
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ Fatal error during auth reset:", err);
      process.exit(1);
    });
}
