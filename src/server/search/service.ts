import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { AuthorizationError } from "@/server/auth/guard";
import { searchQuerySchema, type SearchQueryParams } from "./validation";
import type {
  SearchResultItem,
  SearchResponseDTO,
  SearchEntityType,
} from "@/types";

/**
 * Extracts a concise context snippet around matching query terms.
 */
export function extractSnippet(
  text: string | null | undefined,
  query: string,
  maxLength = 120
): string | undefined {
  if (!text || !text.trim()) return undefined;

  const cleanText = text.replace(/(\r\n|\n|\r)/gm, " ").trim();
  const lowerText = cleanText.toLowerCase();
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);

  if (queryTerms.length === 0) {
    return cleanText.length > maxLength
      ? `${cleanText.slice(0, maxLength)}...`
      : cleanText;
  }

  // Find the position of the earliest matching term
  let earliestIdx = -1;
  for (const term of queryTerms) {
    const idx = lowerText.indexOf(term);
    if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
      earliestIdx = idx;
    }
  }

  if (earliestIdx === -1) {
    return cleanText.length > maxLength
      ? `${cleanText.slice(0, maxLength)}...`
      : cleanText;
  }

  const start = Math.max(0, earliestIdx - 30);
  const end = Math.min(cleanText.length, start + maxLength);
  let snippet = cleanText.slice(start, end);

  if (start > 0) snippet = `...${snippet}`;
  if (end < cleanText.length) snippet = `${snippet}...`;

  return snippet;
}

/**
 * Native PostgreSQL search for Notes.
 */
async function searchNotes(
  userId: string,
  query: string,
  limit: number
): Promise<SearchResultItem[]> {
  const result = await db.execute<{
    id: string;
    title: string;
    slug: string;
    content: string;
    note_type: string;
    area: string;
    tags: string[];
    updated_at: Date;
    score: number;
  }>(sql`
    SELECT 
      id, 
      title, 
      slug, 
      content, 
      note_type, 
      area, 
      tags, 
      updated_at,
      (
        CASE WHEN LOWER(title) = LOWER(${query}) THEN 10.0 ELSE 0.0 END +
        CASE WHEN title ILIKE ${query + "%"} THEN 5.0 ELSE 0.0 END +
        CASE WHEN title ILIKE ${"%" + query + "%"} THEN 2.0 ELSE 0.0 END +
        GREATEST(similarity(title, ${query}), word_similarity(${query}, title)) * 3.0 +
        ts_rank_cd(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')), websearch_to_tsquery('english', ${query})) * 4.0
      )::float as score
    FROM notes
    WHERE user_id = ${userId}
      AND is_archived = false
      AND (
        to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')) @@ websearch_to_tsquery('english', ${query})
        OR title % ${query}
        OR ${query} <% title
        OR word_similarity(${query}, title) > 0.4
        OR title ILIKE ${"%" + query + "%"}
        OR content ILIKE ${"%" + query + "%"}
      )
    ORDER BY score DESC, updated_at DESC
    LIMIT ${limit}
  `);

  return (result.rows || []).map((row) => {
    const areaLabel = row.area.replace("_", " ");
    const typeLabel = row.note_type.replace("_", " ");
    const subtitle = `${areaLabel.charAt(0).toUpperCase() + areaLabel.slice(1)} • ${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)}`;
    const snippet = extractSnippet(row.content, query);

    return {
      id: row.id,
      type: "note",
      title: row.title,
      subtitle,
      snippet,
      href: `/notes?id=${row.id}`,
      score: Number(row.score) || 0,
      metadata: {
        slug: row.slug,
        noteType: row.note_type,
        area: row.area,
        tags: row.tags || [],
      },
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  });
}

/**
 * Native PostgreSQL search for Tasks.
 */
async function searchTasks(
  userId: string,
  query: string,
  limit: number
): Promise<SearchResultItem[]> {
  const result = await db.execute<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    tags: string[];
    due_date: Date | null;
    updated_at: Date;
    score: number;
  }>(sql`
    SELECT 
      id, 
      title, 
      description, 
      status, 
      priority, 
      tags, 
      due_date, 
      updated_at,
      (
        CASE WHEN LOWER(title) = LOWER(${query}) THEN 10.0 ELSE 0.0 END +
        CASE WHEN title ILIKE ${query + "%"} THEN 5.0 ELSE 0.0 END +
        CASE WHEN title ILIKE ${"%" + query + "%"} THEN 2.0 ELSE 0.0 END +
        GREATEST(similarity(title, ${query}), word_similarity(${query}, title)) * 3.0 +
        ts_rank_cd(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')), websearch_to_tsquery('english', ${query})) * 4.0
      )::float as score
    FROM tasks
    WHERE user_id = ${userId}
      AND status != 'cancelled'
      AND (
        to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')) @@ websearch_to_tsquery('english', ${query})
        OR title % ${query}
        OR ${query} <% title
        OR word_similarity(${query}, title) > 0.4
        OR title ILIKE ${"%" + query + "%"}
        OR coalesce(description, '') ILIKE ${"%" + query + "%"}
      )
    ORDER BY score DESC, updated_at DESC
    LIMIT ${limit}
  `);

  return (result.rows || []).map((row) => {
    const statusLabel = row.status.replace("_", " ");
    const priorityLabel = row.priority;
    const dueLabel = row.due_date
      ? ` • Due ${new Date(row.due_date).toLocaleDateString()}`
      : "";
    const subtitle = `${statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)} • ${priorityLabel.toUpperCase()}${dueLabel}`;
    const snippet = extractSnippet(row.description, query);

    return {
      id: row.id,
      type: "task",
      title: row.title,
      subtitle,
      snippet,
      href: `/tasks?id=${row.id}`,
      score: Number(row.score) || 0,
      metadata: {
        status: row.status,
        priority: row.priority,
        dueDate: row.due_date ? new Date(row.due_date).toISOString() : null,
        tags: row.tags || [],
      },
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  });
}

/**
 * Native PostgreSQL search for Projects.
 */
async function searchProjects(
  userId: string,
  query: string,
  limit: number
): Promise<SearchResultItem[]> {
  const result = await db.execute<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    area: string;
    deadline: Date | null;
    updated_at: Date;
    score: number;
  }>(sql`
    SELECT 
      id, 
      name as title, 
      description, 
      status, 
      priority, 
      area, 
      deadline, 
      updated_at,
      (
        CASE WHEN LOWER(name) = LOWER(${query}) THEN 10.0 ELSE 0.0 END +
        CASE WHEN name ILIKE ${query + "%"} THEN 5.0 ELSE 0.0 END +
        CASE WHEN name ILIKE ${"%" + query + "%"} THEN 2.0 ELSE 0.0 END +
        GREATEST(similarity(name, ${query}), word_similarity(${query}, name)) * 3.0 +
        ts_rank_cd(to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '')), websearch_to_tsquery('english', ${query})) * 4.0
      )::float as score
    FROM projects
    WHERE user_id = ${userId}
      AND status != 'archived'
      AND (
        to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '')) @@ websearch_to_tsquery('english', ${query})
        OR name % ${query}
        OR ${query} <% name
        OR word_similarity(${query}, name) > 0.4
        OR name ILIKE ${"%" + query + "%"}
        OR coalesce(description, '') ILIKE ${"%" + query + "%"}
      )
    ORDER BY score DESC, updated_at DESC
    LIMIT ${limit}
  `);

  return (result.rows || []).map((row) => {
    const statusLabel = row.status.replace("_", " ");
    const areaLabel = row.area.replace("_", " ");
    const subtitle = `${statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)} • ${areaLabel.charAt(0).toUpperCase() + areaLabel.slice(1)}`;
    const snippet = extractSnippet(row.description, query);

    return {
      id: row.id,
      type: "project",
      title: row.title,
      subtitle,
      snippet,
      href: `/projects?id=${row.id}`,
      score: Number(row.score) || 0,
      metadata: {
        status: row.status,
        priority: row.priority,
        area: row.area,
        deadline: row.deadline ? new Date(row.deadline).toISOString() : null,
      },
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  });
}

/**
 * Native PostgreSQL search for Goals.
 */
async function searchGoals(
  userId: string,
  query: string,
  limit: number
): Promise<SearchResultItem[]> {
  const result = await db.execute<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    horizon: string;
    area: string;
    updated_at: Date;
    score: number;
  }>(sql`
    SELECT 
      id, 
      title, 
      description, 
      status, 
      horizon, 
      area, 
      updated_at,
      (
        CASE WHEN LOWER(title) = LOWER(${query}) THEN 10.0 ELSE 0.0 END +
        CASE WHEN title ILIKE ${query + "%"} THEN 5.0 ELSE 0.0 END +
        CASE WHEN title ILIKE ${"%" + query + "%"} THEN 2.0 ELSE 0.0 END +
        GREATEST(similarity(title, ${query}), word_similarity(${query}, title)) * 3.0 +
        ts_rank_cd(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')), websearch_to_tsquery('english', ${query})) * 4.0
      )::float as score
    FROM goals
    WHERE user_id = ${userId}
      AND status != 'archived'
      AND (
        to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')) @@ websearch_to_tsquery('english', ${query})
        OR title % ${query}
        OR ${query} <% title
        OR word_similarity(${query}, title) > 0.4
        OR title ILIKE ${"%" + query + "%"}
        OR coalesce(description, '') ILIKE ${"%" + query + "%"}
      )
    ORDER BY score DESC, updated_at DESC
    LIMIT ${limit}
  `);

  return (result.rows || []).map((row) => {
    const horizonLabel = row.horizon.replace("_", " ");
    const statusLabel = row.status.replace("_", " ");
    const subtitle = `${horizonLabel.charAt(0).toUpperCase() + horizonLabel.slice(1)} • ${statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)}`;
    const snippet = extractSnippet(row.description, query);

    return {
      id: row.id,
      type: "goal",
      title: row.title,
      subtitle,
      snippet,
      href: `/goals?id=${row.id}`,
      score: Number(row.score) || 0,
      metadata: {
        status: row.status,
        horizon: row.horizon,
        area: row.area,
      },
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  });
}

/**
 * Native PostgreSQL search for People (CRM Contacts).
 */
async function searchPeople(
  userId: string,
  query: string,
  limit: number
): Promise<SearchResultItem[]> {
  const result = await db.execute<{
    id: string;
    title: string;
    company: string | null;
    role: string | null;
    email: string | null;
    phone: string | null;
    relationship_type: string;
    tags: string[];
    notes: string | null;
    updated_at: Date;
    score: number;
  }>(sql`
    SELECT 
      id, 
      name as title, 
      company, 
      role, 
      email, 
      phone, 
      relationship_type, 
      tags, 
      notes, 
      updated_at,
      (
        CASE WHEN LOWER(name) = LOWER(${query}) THEN 10.0 ELSE 0.0 END +
        CASE WHEN name ILIKE ${query + "%"} THEN 5.0 ELSE 0.0 END +
        CASE WHEN name ILIKE ${"%" + query + "%"} THEN 2.0 ELSE 0.0 END +
        GREATEST(similarity(name, ${query}), word_similarity(${query}, name), similarity(coalesce(company, ''), ${query}), word_similarity(${query}, coalesce(company, ''))) * 3.0 +
        ts_rank_cd(to_tsvector('english', coalesce(name, '') || ' ' || coalesce(company, '') || ' ' || coalesce(role, '') || ' ' || coalesce(notes, '')), websearch_to_tsquery('english', ${query})) * 4.0
      )::float as score
    FROM people
    WHERE user_id = ${userId}
      AND is_archived = false
      AND (
        to_tsvector('english', coalesce(name, '') || ' ' || coalesce(company, '') || ' ' || coalesce(role, '') || ' ' || coalesce(notes, '')) @@ websearch_to_tsquery('english', ${query})
        OR name % ${query}
        OR ${query} <% name
        OR coalesce(company, '') % ${query}
        OR ${query} <% coalesce(company, '')
        OR word_similarity(${query}, name) > 0.4
        OR name ILIKE ${"%" + query + "%"}
        OR coalesce(company, '') ILIKE ${"%" + query + "%"}
        OR coalesce(role, '') ILIKE ${"%" + query + "%"}
        OR coalesce(email, '') ILIKE ${"%" + query + "%"}
        OR coalesce(notes, '') ILIKE ${"%" + query + "%"}
      )
    ORDER BY score DESC, updated_at DESC
    LIMIT ${limit}
  `);

  return (result.rows || []).map((row) => {
    const relLabel = row.relationship_type.replace("_", " ");
    const roleComp = [row.role, row.company].filter(Boolean).join(" at ");
    const subtitle = roleComp
      ? `${roleComp} (${relLabel.charAt(0).toUpperCase() + relLabel.slice(1)})`
      : relLabel.charAt(0).toUpperCase() + relLabel.slice(1);
    const snippet = extractSnippet(row.notes, query);

    return {
      id: row.id,
      type: "person",
      title: row.title,
      subtitle,
      snippet,
      href: `/people?id=${row.id}`,
      score: Number(row.score) || 0,
      metadata: {
        company: row.company,
        role: row.role,
        email: row.email,
        phone: row.phone,
        relationshipType: row.relationship_type,
        tags: row.tags || [],
      },
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  });
}

/**
 * Unified cross-domain search across Notes, Tasks, Projects, Goals, and People.
 */
export async function search(
  userId: string,
  params?: unknown
): Promise<SearchResponseDTO> {
  if (!userId || typeof userId !== "string") {
    throw new AuthorizationError("Authentication required.");
  }

  const queryParams: SearchQueryParams = searchQuerySchema.parse(params ?? {});
  const { q, type, limit } = queryParams;

  const typeMap: Record<SearchEntityType, number> = {
    note: 0,
    task: 0,
    project: 0,
    goal: 0,
    person: 0,
  };

  const shouldSearch = (targetType: SearchEntityType) =>
    type === "all" || type === targetType;

  const notesPromise = shouldSearch("note")
    ? searchNotes(userId, q, limit)
    : Promise.resolve([]);
  const tasksPromise = shouldSearch("task")
    ? searchTasks(userId, q, limit)
    : Promise.resolve([]);
  const projectsPromise = shouldSearch("project")
    ? searchProjects(userId, q, limit)
    : Promise.resolve([]);
  const goalsPromise = shouldSearch("goal")
    ? searchGoals(userId, q, limit)
    : Promise.resolve([]);
  const peoplePromise = shouldSearch("person")
    ? searchPeople(userId, q, limit)
    : Promise.resolve([]);

  const [notes, tasks, projects, goals, people] = await Promise.all([
    notesPromise,
    tasksPromise,
    projectsPromise,
    goalsPromise,
    peoplePromise,
  ]);

  typeMap.note = notes.length;
  typeMap.task = tasks.length;
  typeMap.project = projects.length;
  typeMap.goal = goals.length;
  typeMap.person = people.length;

  const combined = [...notes, ...tasks, ...projects, ...goals, ...people];

  // Rank combined results: highest composite score first, then newest updated
  combined.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const finalResults = combined.slice(0, limit);

  return {
    query: q,
    results: finalResults,
    total: combined.length,
    byType: typeMap,
  };
}
