CREATE OR REPLACE FUNCTION tasks_prevent_hierarchy_cycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cycle_detected boolean := false;
BEGIN
  IF NEW.parent_task_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.parent_task_id IS NOT DISTINCT FROM OLD.parent_task_id THEN
    RETURN NEW;
  END IF;

  -- 1. Direct self-cycle check
  IF NEW.parent_task_id = NEW.id THEN
    RAISE EXCEPTION 'A task cannot be its own parent (direct cycle detected)'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2. Traverse ancestors starting from NEW.parent_task_id
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_task_id, 1 as depth
    FROM public.tasks
    WHERE id = NEW.parent_task_id AND user_id = NEW.user_id
    
    UNION ALL
    
    SELECT t.id, t.parent_task_id, a.depth + 1
    FROM public.tasks t
    JOIN ancestors a ON t.id = a.parent_task_id
    WHERE t.user_id = NEW.user_id
      AND a.depth < 100
  )
  SELECT true INTO cycle_detected
  FROM ancestors
  WHERE id = NEW.id
  LIMIT 1;

  IF cycle_detected THEN
    RAISE EXCEPTION 'Task hierarchy cycle detected: task % cannot have descendant % as parent', NEW.id, NEW.parent_task_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_tasks_prevent_hierarchy_cycle ON "tasks";
--> statement-breakpoint
CREATE TRIGGER trg_tasks_prevent_hierarchy_cycle
BEFORE INSERT OR UPDATE OF parent_task_id, id, user_id ON "tasks"
FOR EACH ROW
EXECUTE FUNCTION tasks_prevent_hierarchy_cycle();
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'lifeos_app') THEN
    GRANT EXECUTE ON FUNCTION tasks_prevent_hierarchy_cycle() TO lifeos_app;
  END IF;
END $$;
