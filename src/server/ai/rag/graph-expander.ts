import { eq, and, desc, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import {
  projects,
  goals,
  tasks,
  interactions,
  learningItems,
  notes,
} from "@/server/db/schema";
import type { RetrievedEntity } from "./types";

/**
 * Traverses relational foreign keys (1-2 hops) strictly scoped to the authenticated user
 * to enrich retrieved entities with structural personal graph context.
 */
export async function expandEntityGraph(
  userId: string,
  entities: RetrievedEntity[]
): Promise<RetrievedEntity[]> {
  if (!entities || entities.length === 0) return [];

  const enriched: RetrievedEntity[] = [];

  for (const entity of entities) {
    const relations: NonNullable<RetrievedEntity["relations"]> = [];

    try {
      switch (entity.domain) {
        case "task": {
          // If task has projectId, find project
          const [taskRow] = await db
            .select({
              projectId: tasks.projectId,
              goalId: tasks.goalId,
            })
            .from(tasks)
            .where(and(eq(tasks.id, entity.id), eq(tasks.userId, userId)))
            .limit(1);

          if (taskRow?.projectId) {
            const [proj] = await db
              .select({ id: projects.id, name: projects.name, status: projects.status })
              .from(projects)
              .where(
                and(eq(projects.id, taskRow.projectId), eq(projects.userId, userId))
              )
              .limit(1);
            if (proj) {
              relations.push({
                relationType: "parent_project",
                entityId: proj.id,
                domain: "project",
                title: proj.name,
                details: `Status: ${proj.status}`,
              });
            }
          }

          if (taskRow?.goalId) {
            const [g] = await db
              .select({ id: goals.id, title: goals.title, status: goals.status })
              .from(goals)
              .where(and(eq(goals.id, taskRow.goalId), eq(goals.userId, userId)))
              .limit(1);
            if (g) {
              relations.push({
                relationType: "linked_goal",
                entityId: g.id,
                domain: "goal",
                title: g.title,
                details: `Status: ${g.status}`,
              });
            }
          }
          break;
        }

        case "project": {
          // Find parent goal and active tasks count
          const [projRow] = await db
            .select({ goalId: projects.goalId })
            .from(projects)
            .where(and(eq(projects.id, entity.id), eq(projects.userId, userId)))
            .limit(1);

          if (projRow?.goalId) {
            const [g] = await db
              .select({ id: goals.id, title: goals.title })
              .from(goals)
              .where(and(eq(goals.id, projRow.goalId), eq(goals.userId, userId)))
              .limit(1);
            if (g) {
              relations.push({
                relationType: "parent_goal",
                entityId: g.id,
                domain: "goal",
                title: g.title,
              });
            }
          }
          break;
        }

        case "goal": {
          // Find child projects
          const childProjects = await db
            .select({ id: projects.id, name: projects.name, status: projects.status })
            .from(projects)
            .where(and(eq(projects.goalId, entity.id), eq(projects.userId, userId)))
            .limit(3);

          for (const cp of childProjects) {
            relations.push({
              relationType: "child_project",
              entityId: cp.id,
              domain: "project",
              title: cp.name,
              details: `Status: ${cp.status}`,
            });
          }
          break;
        }

        case "person": {
          // Find recent 3 interactions
          const recentInteractions = await db
            .select({
              id: interactions.id,
              channel: interactions.channel,
              summary: interactions.summary,
              date: interactions.date,
            })
            .from(interactions)
            .where(
              and(
                eq(interactions.personId, entity.id),
                eq(interactions.userId, userId)
              )
            )
            .orderBy(desc(interactions.date))
            .limit(3);

          for (const inter of recentInteractions) {
            const dateStr = inter.date instanceof Date
              ? inter.date.toISOString().slice(0, 10)
              : String(inter.date).slice(0, 10);
            relations.push({
              relationType: "recent_interaction",
              entityId: inter.id,
              domain: "interaction",
              title: `${inter.channel} on ${dateStr}`,
              details: inter.summary,
            });
          }
          break;
        }

        case "note": {
          // Find linked learning item
          const [noteRow] = await db
            .select({ learningId: notes.learningId })
            .from(notes)
            .where(and(eq(notes.id, entity.id), eq(notes.userId, userId)))
            .limit(1);

          if (noteRow?.learningId) {
            const [item] = await db
              .select({ id: learningItems.id, title: learningItems.title })
              .from(learningItems)
              .where(
                and(
                  eq(learningItems.id, noteRow.learningId),
                  eq(learningItems.userId, userId)
                )
              )
              .limit(1);
            if (item) {
              relations.push({
                relationType: "linked_learning",
                entityId: item.id,
                domain: "learning",
                title: item.title,
              });
            }
          }
          break;
        }

        default:
          break;
      }
    } catch (err) {
      // In case of any relational expansion error, keep entity without relations
      console.warn(`[GraphExpander] Error expanding entity ${entity.id}:`, err);
    }

    enriched.push({
      ...entity,
      relations: relations.length > 0 ? relations : undefined,
    });
  }

  return enriched;
}
