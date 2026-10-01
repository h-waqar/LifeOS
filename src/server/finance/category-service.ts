import { eq, and, asc, count } from "drizzle-orm";
import { db } from "@/server/db";
import {
  financeCategories,
  type FinanceCategory,
} from "@/server/db/schema";
import { createAuditLog } from "@/server/audit";
import {
  createCategorySchema,
  updateCategorySchema,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from "./validation";
import { NotFoundError } from "./errors";
import { guardFinancialMutation } from "@/server/agents/finance-shield";

// Server-only runtime protection
if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error(
    "Security violation: Finance Category service cannot be initialized in the browser."
  );
}

export { NotFoundError };

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "Food", icon: "Utensils", color: "#f97316" },
  { name: "Transport", icon: "Car", color: "#3b82f6" },
  { name: "Hardware", icon: "Cpu", color: "#6366f1" },
  { name: "Software", icon: "Code", color: "#8b5cf6" },
  { name: "Entertainment", icon: "Film", color: "#ec4899" },
  { name: "Education", icon: "GraduationCap", color: "#eab308" },
  { name: "Business", icon: "Briefcase", color: "#14b8a6" },
  { name: "Bills", icon: "Receipt", color: "#ef4444" },
  { name: "Other", icon: "MoreHorizontal", color: "#64748b" },
];

const DEFAULT_INCOME_CATEGORIES = [
  { name: "Salary", icon: "Banknote", color: "#22c55e" },
  { name: "Freelance", icon: "Laptop", color: "#10b981" },
  { name: "Investment", icon: "TrendingUp", color: "#06b6d4" },
  { name: "Gift", icon: "Gift", color: "#a855f7" },
  { name: "Other Income", icon: "Coins", color: "#84cc16" },
];

/**
 * Seeds standard default categories for a user if they have none.
 */
export async function seedDefaultCategories(userId: string): Promise<void> {
  const [{ count: existingCount }] = await db
    .select({ count: count() })
    .from(financeCategories)
    .where(eq(financeCategories.userId, userId));

  if (Number(existingCount) > 0) {
    return;
  }

  const itemsToInsert = [
    ...DEFAULT_EXPENSE_CATEGORIES.map((c) => ({
      userId,
      name: c.name,
      categoryType: "expense" as const,
      icon: c.icon,
      color: c.color,
      isArchived: false,
      isSystem: true,
    })),
    ...DEFAULT_INCOME_CATEGORIES.map((c) => ({
      userId,
      name: c.name,
      categoryType: "income" as const,
      icon: c.icon,
      color: c.color,
      isArchived: false,
      isSystem: true,
    })),
  ];

  await db.insert(financeCategories).values(itemsToInsert).onConflictDoNothing();
}

/**
 * Lists categories for a user. Auto-seeds defaults on first call.
 */
export async function listCategories(
  userId: string,
  options?: { type?: "expense" | "income"; includeArchived?: boolean }
): Promise<FinanceCategory[]> {
  await seedDefaultCategories(userId);

  const conditions = [eq(financeCategories.userId, userId)];
  if (options?.type) {
    conditions.push(eq(financeCategories.categoryType, options.type));
  }
  if (!options?.includeArchived) {
    conditions.push(eq(financeCategories.isArchived, false));
  }

  const rows = await db
    .select()
    .from(financeCategories)
    .where(and(...conditions))
    .orderBy(
      asc(financeCategories.categoryType),
      asc(financeCategories.isArchived),
      asc(financeCategories.name)
    );

  return rows;
}

/**
 * Fetches category by ID.
 */
export async function getCategoryById(
  userId: string,
  categoryId: string
): Promise<FinanceCategory | null> {
  const [cat] = await db
    .select()
    .from(financeCategories)
    .where(
      and(
        eq(financeCategories.userId, userId),
        eq(financeCategories.id, categoryId)
      )
    )
    .limit(1);

  return cat ?? null;
}

/**
 * Creates a custom category.
 */
export async function createCategory(
  userId: string,
  input: CreateCategoryInput
): Promise<FinanceCategory> {
  guardFinancialMutation("createCategory");
  const validated = createCategorySchema.parse(input);

  const [created] = await db
    .insert(financeCategories)
    .values({
      userId,
      name: validated.name,
      categoryType: validated.categoryType,
      icon: validated.icon ?? null,
      color: validated.color ?? null,
      isArchived: false,
      isSystem: false,
    })
    .returning();

  await createAuditLog({
    userId,
    category: "mutation",
    action: "finance.category.created",
    status: "success",
    details: {
      categoryId: created.id,
      name: created.name,
      categoryType: created.categoryType,
    },
  });

  return created;
}

/**
 * Updates an existing category.
 */
export async function updateCategory(
  userId: string,
  categoryId: string,
  input: UpdateCategoryInput
): Promise<FinanceCategory> {
  guardFinancialMutation("updateCategory");
  const validated = updateCategorySchema.parse(input);

  const existing = await getCategoryById(userId, categoryId);
  if (!existing) {
    throw new NotFoundError(`Category not found: ${categoryId}`);
  }

  const updatePayload: Partial<typeof financeCategories.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (validated.name !== undefined) updatePayload.name = validated.name;
  if (validated.icon !== undefined) updatePayload.icon = validated.icon;
  if (validated.color !== undefined) updatePayload.color = validated.color;
  if (validated.isArchived !== undefined)
    updatePayload.isArchived = validated.isArchived;

  const [updated] = await db
    .update(financeCategories)
    .set(updatePayload)
    .where(
      and(
        eq(financeCategories.userId, userId),
        eq(financeCategories.id, categoryId)
      )
    )
    .returning();

  await createAuditLog({
    userId,
    category: "mutation",
    action: "finance.category.updated",
    status: "success",
    details: {
      categoryId: updated.id,
      changes: validated,
    },
  });

  return updated;
}

/**
 * Soft-archives a category.
 */
export async function archiveCategory(
  userId: string,
  categoryId: string
): Promise<FinanceCategory> {
  guardFinancialMutation("archiveCategory");
  return updateCategory(userId, categoryId, { isArchived: true });
}
