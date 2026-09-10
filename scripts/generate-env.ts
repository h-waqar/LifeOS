import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function generateSecretHex(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

function run() {
  const rootDir = process.cwd();
  const envExamplePath = path.join(rootDir, ".env.example");
  const envLocalPath = path.join(rootDir, ".env.local");

  if (!fs.existsSync(envExamplePath)) {
    console.error("Error: .env.example file not found in current directory.");
    process.exit(1);
  }

  let template = fs.readFileSync(envExamplePath, "utf-8");

  const encryptionKey = generateSecretHex(32); // 64 hex characters
  const authSecret = generateSecretHex(32); // 64 hex characters

  let content = template.replace(
    /^BETTER_AUTH_SECRET=.*$/m,
    `BETTER_AUTH_SECRET=${authSecret}`
  );
  content = content.replace(
    /^LIFEOS_ENCRYPTION_KEY=.*$/m,
    `LIFEOS_ENCRYPTION_KEY=${encryptionKey}`
  );

  fs.writeFileSync(envLocalPath, content, { mode: 0o600 });
  try {
    fs.chmodSync(envLocalPath, 0o600);
  } catch {
    // Mode already set on creation
  }

  console.log("✔ Successfully generated .env.local with secure secrets (file permissions: 0600).");
}

run();
