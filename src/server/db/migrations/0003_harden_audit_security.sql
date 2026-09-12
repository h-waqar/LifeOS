CREATE OR REPLACE FUNCTION purge_expired_audit_logs(retention_days integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  deleted_count integer := 0;
  cutoff_timestamp timestamp with time zone;
BEGIN
  -- 1. Enforce minimum retention threshold (mandatory 90-day wall)
  IF retention_days IS NULL OR retention_days < 90 THEN
    RAISE EXCEPTION 'Retention period must be at least 90 days (requested: %)', retention_days
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2. Enforce maximum reasonable retention limit to prevent numeric overflow
  IF retention_days > 36500 THEN
    RAISE EXCEPTION 'Retention period exceeds maximum threshold of 36500 days (100 years)'
      USING ERRCODE = 'numeric_value_out_of_range';
  END IF;

  -- 3. Compute retention cutoff safely using make_interval
  cutoff_timestamp := CURRENT_TIMESTAMP - make_interval(days => retention_days);

  -- 4. Assert cutoff is strictly <= 90 days ago
  IF cutoff_timestamp > (CURRENT_TIMESTAMP - interval '90 days') THEN
    RAISE EXCEPTION 'Calculated cutoff % violates mandatory 90-day retention wall', cutoff_timestamp
      USING ERRCODE = 'check_violation';
  END IF;

  -- 5. Set transaction-local purge authorization flag
  PERFORM set_config('lifeos.in_purge_procedure', 'true', true);

  -- 6. Delete expired records with schema qualification
  DELETE FROM public.audit_log
  WHERE created_at < cutoff_timestamp;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- 7. Reset transaction-local flag
  PERFORM set_config('lifeos.in_purge_procedure', 'false', true);

  RETURN deleted_count;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION purge_expired_audit_logs(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION purge_expired_audit_logs(integer) TO lifeos_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_log_prevent_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  -- Allow foreign key ON DELETE SET NULL on user_id when user is deleted,
  -- provided all other immutable columns remain completely unchanged.
  IF (OLD.user_id IS NOT NULL AND NEW.user_id IS NULL)
     AND OLD.id = NEW.id
     AND OLD.category = NEW.category
     AND OLD.action = NEW.action
     AND OLD.status = NEW.status
     AND (OLD.actor IS NOT DISTINCT FROM NEW.actor)
     AND (OLD.details IS NOT DISTINCT FROM NEW.details)
     AND (OLD.ip_address IS NOT DISTINCT FROM NEW.ip_address)
     AND (OLD.user_agent IS NOT DISTINCT FROM NEW.user_agent)
     AND OLD.created_at = NEW.created_at THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'audit_log records are immutable and cannot be updated'
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION audit_log_prevent_update() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_audit_log_prevent_update ON audit_log;
--> statement-breakpoint
CREATE TRIGGER trg_audit_log_prevent_update
BEFORE UPDATE ON audit_log
FOR EACH ROW
EXECUTE FUNCTION audit_log_prevent_update();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_log_prevent_direct_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  -- Mandatory 90-day wall: records within 90 days can NEVER be deleted under any circumstances
  IF OLD.created_at >= (CURRENT_TIMESTAMP - interval '90 days') THEN
    RAISE EXCEPTION 'Audit log record is within the mandatory 90-day retention wall and cannot be deleted'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Disallow direct delete outside purge_expired_audit_logs() via transaction-local setting
  IF current_setting('lifeos.in_purge_procedure', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Direct DELETE on audit_log is prohibited. Deletion must occur via purge_expired_audit_logs()'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN OLD;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION audit_log_prevent_direct_delete() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_audit_log_prevent_direct_delete ON audit_log;
--> statement-breakpoint
CREATE TRIGGER trg_audit_log_prevent_direct_delete
BEFORE DELETE ON audit_log
FOR EACH ROW
EXECUTE FUNCTION audit_log_prevent_direct_delete();
