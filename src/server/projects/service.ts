import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/server/db";
import { projects, type Project } from "@/server/db/schema";
import { AuthorizationError } from "@/server/auth/guard";
import { createAuditLog } from "@/server/audit";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Projects service cannot be initialized in the browser."
  );
}

export class NotFoundError extends Error {
  readonly status = 404;
  readonly code = "NOT_FOUND";

  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export interface ProjectDTO {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: "planning" | "active" | "paused" | "completed" | "archived";
  priority: "low" | "medium" | "high" | "critical";
  createdAt: string;
  updatedAt: string;
}

export function toProjectDTO(row: Project): ProjectDTO {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    status: row.status as ProjectDTO["status"],
    priority: row.priority as ProjectDTO["priority"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const createProjectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Project name cannot be empty or whitespace")
      .max(255, "Project name cannot exceed 255 characters"),
    description: z
      .string()
      .trim()
      .max(2000, "Project description cannot exceed 2000 characters")
      .nullish(),
    status: z
      .enum(["planning", "active", "paused", "completed", "archived"])
      .optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    userId: z
      .never({ message: "Client cannot specify userId in payload" })
      .optional(),
    id: z.never({ message: "Client cannot specify id in payload" }).optional(),
  })
  .strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Project name cannot be empty or whitespace")
      .max(255, "Project name cannot exceed 255 characters")
      .optional(),
    description: z
      .string()
      .trim()
      .max(2000, "Project description cannot exceed 2000 characters")
      .nullish(),
    status: z
      .enum(["planning", "active", "paused", "completed", "archived"])
      .optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    userId: z
      .never({ message: "Client cannot specify userId in payload" })
      .optional(),
    id: z.never({ message: "Client cannot specify id in payload" }).optional(),
  })
  .strict();

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

function validateUserId(userId: unknown): string {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new AuthorizationError(
      "Authenticated user ID is required to access projects."
    );
  }
  return userId.trim();
}

function validateEntityId(id: unknown, entityName = "Entity"): string {
  if (!id || typeof id !== "string" || !id.trim()) {
    throw new NotFoundError(`${entityName} ID is invalid.`);
  }
  return id.trim();
}

/**
 * Creates a project strictly scoped to the authenticated user.
 */
export async function createProject(
  authenticatedUserId: string,
  input: CreateProjectInput,
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<ProjectDTO> {
  const safeUserId = validateUserId(authenticatedUserId);
  const validated = createProjectSchema.parse(input);

  const [inserted] = await db
    .insert(projects)
    .values({
      userId: safeUserId,
      name: validated.name,
      description: validated.description ?? null,
      status: validated.status ?? "planning",
      priority: validated.priority ?? "medium",
    })
    .returning();

  await createAuditLog({
    userId: safeUserId,
    category: "mutation",
    action: "project.create",
    status: "success",
    details: {
      projectId: inserted.id,
      name: inserted.name,
      status: inserted.status,
    },
    ipAddress: actorInfo?.ipAddress,
    userAgent: actorInfo?.userAgent,
  });

  return toProjectDTO(inserted);
}

/**
 * Retrieves a single project strictly scoped to the authenticated user.
 */
export async function getProject(
  authenticatedUserId: string,
  projectId: string
): Promise<ProjectDTO | null> {
  const safeUserId = validateUserId(authenticatedUserId);
  const safeProjectId = validateEntityId(projectId, "Project");

  const results = await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.userId, safeUserId), eq(projects.id, safeProjectId))
    )
    .limit(1);

  if (!results[0]) {
    return null;
  }

  return toProjectDTO(results[0]);
}

/**
 * Lists projects strictly scoped to the authenticated user.
 */
export async function listProjects(
  authenticatedUserId: string,
  filters?: { status?: string }
): Promise<ProjectDTO[]> {
  const safeUserId = validateUserId(authenticatedUserId);

  const query = db
    .select()
    .from(projects)
    .where(
      filters?.status
        ? and(
            eq(projects.userId, safeUserId),
            eq(projects.status, filters.status as Project["status"])
          )
        : eq(projects.userId, safeUserId)
    );

  const rows = await query;
  return rows.map(toProjectDTO);
}

/**
 * Updates a project strictly scoped to the authenticated user.
 * Throws NotFoundError if project does not exist or belongs to another user.
 */
export async function updateProject(
  authenticatedUserId: string,
  projectId: string,
  input: UpdateProjectInput,
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<ProjectDTO> {
  const safeUserId = validateUserId(authenticatedUserId);
  const safeProjectId = validateEntityId(projectId, "Project");
  const validated = updateProjectSchema.parse(input);

  const existing = await getProject(safeUserId, safeProjectId);
  if (!existing) {
    throw new NotFoundError("Project not found.");
  }

  const updates: Partial<Omit<Project, "id" | "userId" | "createdAt">> = {
    updatedAt: new Date(),
  };

  if (validated.name !== undefined) updates.name = validated.name;
  if (validated.description !== undefined)
    updates.description = validated.description;
  if (validated.status !== undefined) updates.status = validated.status;
  if (validated.priority !== undefined) updates.priority = validated.priority;

  const [updated] = await db
    .update(projects)
    .set(updates)
    .where(
      and(eq(projects.userId, safeUserId), eq(projects.id, safeProjectId))
    )
    .returning();

  if (!updated) {
    throw new NotFoundError("Project not found.");
  }

  await createAuditLog({
    userId: safeUserId,
    category: "mutation",
    action: "project.update",
    status: "success",
    details: {
      projectId: safeProjectId,
      updatedFields: Object.keys(validated),
    },
    ipAddress: actorInfo?.ipAddress,
    userAgent: actorInfo?.userAgent,
  });

  return toProjectDTO(updated);
}

/**
 * Deletes a project strictly scoped to the authenticated user.
 * Associated tasks have their project_id set to null via foreign key ON DELETE SET NULL.
 * Throws NotFoundError if project does not exist or belongs to another user.
 */
export async function deleteProject(
  authenticatedUserId: string,
  projectId: string,
  actorInfo?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<{ success: true }> {
  const safeUserId = validateUserId(authenticatedUserId);
  const safeProjectId = validateEntityId(projectId, "Project");

  const [deleted] = await db
    .delete(projects)
    .where(
      and(eq(projects.userId, safeUserId), eq(projects.id, safeProjectId))
    )
    .returning({ id: projects.id });

  if (!deleted) {
    throw new NotFoundError("Project not found.");
  }

  await createAuditLog({
    userId: safeUserId,
    category: "mutation",
    action: "project.delete",
    status: "success",
    details: { projectId: safeProjectId },
    ipAddress: actorInfo?.ipAddress,
    userAgent: actorInfo?.userAgent,
  });

  return { success: true };
}
