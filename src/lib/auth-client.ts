import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";

/**
 * Client-Side Better Auth Instance.
 * Completely isolated from server-only secrets and database drivers.
 * Uses relative `/api/auth` endpoints or window origin in browser environments.
 */
export const authClient = createAuthClient({
  plugins: [passkeyClient()],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  passkey,
} = authClient;
