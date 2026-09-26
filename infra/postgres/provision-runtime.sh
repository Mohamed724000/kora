#!/bin/sh
set -eu

runtime_user="${KORA_POSTGRES_RUNTIME_USER:?KORA_POSTGRES_RUNTIME_USER is required}"
case "$runtime_user" in
  *[!A-Za-z0-9_]* | [0-9]* | '')
    echo 'PostgreSQL runtime role has an invalid identifier.' >&2
    exit 1
    ;;
esac

runtime_password_length="$(tr -d '\r\n' </run/secrets/postgres_runtime_password | wc -c | tr -d ' ')"
if [ "$runtime_password_length" -ne 43 ]; then
  echo 'PostgreSQL runtime secret has an invalid format.' >&2
  exit 1
fi

export PGPASSWORD="$(tr -d '\r\n' </run/secrets/postgres_password)"

psql \
  --host=127.0.0.1 \
  --port=5432 \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --no-psqlrc \
  --quiet \
  --set=ON_ERROR_STOP=1 \
  --set=runtime_user="$runtime_user" <<'SQL'
\set runtime_password `tr -d '\r\n' </run/secrets/postgres_runtime_password`

BEGIN;

WITH runtime_role AS (
  SELECT oid
  FROM pg_catalog.pg_roles
  WHERE rolname = :'runtime_user'
), current_owner_role AS (
  SELECT oid
  FROM pg_catalog.pg_roles
  WHERE rolname = current_user
), current_database_entry AS (
  SELECT oid
  FROM pg_catalog.pg_database
  WHERE datname = current_database()
), unsafe_session_replication_setting AS (
  SELECT 1
  FROM pg_catalog.pg_db_role_setting AS role_setting
  CROSS JOIN current_database_entry
  CROSS JOIN LATERAL unnest(role_setting.setconfig) AS setting_entry(setting)
  WHERE (
      role_setting.setrole = 0
      OR role_setting.setrole = (SELECT oid FROM runtime_role)
      OR role_setting.setrole = (SELECT oid FROM current_owner_role)
    )
    AND role_setting.setdatabase IN (0, current_database_entry.oid)
    AND split_part(setting_entry.setting, '=', 1) = 'session_replication_role'
    AND (
      role_setting.setrole = (SELECT oid FROM current_owner_role)
      OR split_part(setting_entry.setting, '=', 2) <> 'origin'
    )
  UNION ALL
  SELECT 1
  WHERE pg_catalog.current_setting('session_replication_role') <> 'origin'
)
SELECT
  NOT EXISTS (SELECT 1 FROM unsafe_session_replication_setting)
    AS session_replication_boundary_safe,
  (SELECT count(*) FROM unsafe_session_replication_setting)
    AS session_replication_violation_count
\gset

\if :session_replication_boundary_safe
\else
  \echo PostgreSQL runtime provisioning refused unsafe session replication setting count=:session_replication_violation_count.
  DO $session_replication_refusal$
  BEGIN
    RAISE EXCEPTION 'unsafe session replication setting';
  END
  $session_replication_refusal$;
\endif

WITH runtime_role AS (
  SELECT oid
  FROM pg_catalog.pg_roles
  WHERE rolname = :'runtime_user'
), current_owner_role AS (
  SELECT oid
  FROM pg_catalog.pg_roles
  WHERE rolname = current_user
), current_database_entry AS (
  SELECT oid
  FROM pg_catalog.pg_database
  WHERE datname = current_database()
), unsafe_large_object_compatibility_setting AS (
  SELECT 1
  FROM pg_catalog.pg_db_role_setting AS role_setting
  CROSS JOIN current_database_entry
  CROSS JOIN LATERAL unnest(role_setting.setconfig) AS setting_entry(setting)
  WHERE (
      role_setting.setrole = 0
      OR role_setting.setrole = (SELECT oid FROM runtime_role)
      OR role_setting.setrole = (SELECT oid FROM current_owner_role)
    )
    AND role_setting.setdatabase IN (0, current_database_entry.oid)
    AND split_part(setting_entry.setting, '=', 1) = 'lo_compat_privileges'
    AND (
      role_setting.setrole = (SELECT oid FROM current_owner_role)
      OR split_part(setting_entry.setting, '=', 2) <> 'off'
    )
  UNION ALL
  SELECT 1
  WHERE pg_catalog.current_setting('lo_compat_privileges') <> 'off'
)
SELECT
  NOT EXISTS (SELECT 1 FROM unsafe_large_object_compatibility_setting)
    AS large_object_compatibility_boundary_safe,
  (SELECT count(*) FROM unsafe_large_object_compatibility_setting)
    AS large_object_compatibility_violation_count
\gset

\if :large_object_compatibility_boundary_safe
\else
  \echo PostgreSQL runtime provisioning refused unsafe large object compatibility setting count=:large_object_compatibility_violation_count.
  DO $large_object_compatibility_refusal$
  BEGIN
    RAISE EXCEPTION 'unsafe large object compatibility setting';
  END
  $large_object_compatibility_refusal$;
\endif

WITH RECURSIVE runtime_role AS (
  SELECT oid, rolsuper
  FROM pg_catalog.pg_roles
  WHERE rolname = :'runtime_user'
), runtime_effective_roles AS (
  SELECT oid
  FROM runtime_role
  UNION
  SELECT membership.roleid
  FROM pg_catalog.pg_auth_members AS membership
  JOIN runtime_effective_roles AS effective_role
    ON effective_role.oid = membership.member
  JOIN pg_catalog.pg_roles AS member_role
    ON member_role.oid = membership.member
  WHERE member_role.rolinherit
    AND membership.inherit_option
), large_object_catalogs AS (
  SELECT relation_entry.oid, relation_entry.relacl, relation_entry.relname,
         relation_entry.relowner
  FROM pg_catalog.pg_class AS relation_entry
  JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = relation_entry.relnamespace
  WHERE namespace_entry.nspname = 'pg_catalog'
    AND relation_entry.relname IN ('pg_largeobject', 'pg_largeobject_metadata')
), unsafe_large_object_catalog_state AS (
  SELECT 1
  FROM large_object_catalogs AS catalog_entry
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
      catalog_entry.relacl,
      pg_catalog.acldefault('r', catalog_entry.relowner)
    )
  ) AS privilege
  WHERE privilege.grantee = 0
    AND (
      catalog_entry.relname = 'pg_largeobject'
      OR privilege.privilege_type <> 'SELECT'
      OR privilege.is_grantable
    )
  UNION ALL
  SELECT 1
  FROM pg_catalog.pg_attribute AS attribute_entry
  JOIN large_object_catalogs AS catalog_entry
    ON catalog_entry.oid = attribute_entry.attrelid
  CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
  WHERE attribute_entry.attnum > 0
    AND NOT attribute_entry.attisdropped
    AND privilege.grantee = 0
  UNION ALL
  SELECT 1
  FROM large_object_catalogs AS catalog_entry
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
      catalog_entry.relacl,
      pg_catalog.acldefault('r', catalog_entry.relowner)
    )
  ) AS privilege
  WHERE privilege.grantee IN (SELECT oid FROM runtime_effective_roles)
  UNION ALL
  SELECT 1
  FROM pg_catalog.pg_attribute AS attribute_entry
  JOIN large_object_catalogs AS catalog_entry
    ON catalog_entry.oid = attribute_entry.attrelid
  CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
  WHERE attribute_entry.attnum > 0
    AND NOT attribute_entry.attisdropped
    AND privilege.grantee IN (SELECT oid FROM runtime_effective_roles)
  UNION ALL
  SELECT 1
  FROM large_object_catalogs AS catalog_entry
  CROSS JOIN runtime_role
  WHERE NOT runtime_role.rolsuper
    AND (
    (
      catalog_entry.relname = 'pg_largeobject'
      AND (
        pg_catalog.has_table_privilege(
          runtime_role.oid,
          catalog_entry.oid,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
        )
        OR pg_catalog.has_any_column_privilege(
          runtime_role.oid,
          catalog_entry.oid,
          'SELECT,INSERT,UPDATE,REFERENCES'
        )
      )
    )
    OR (
      catalog_entry.relname = 'pg_largeobject_metadata'
      AND (
        pg_catalog.has_table_privilege(
          runtime_role.oid,
          catalog_entry.oid,
          'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
        )
        OR pg_catalog.has_any_column_privilege(
          runtime_role.oid,
          catalog_entry.oid,
          'INSERT,UPDATE,REFERENCES'
        )
      )
    )
    OR pg_catalog.has_table_privilege(
      runtime_role.oid,
      catalog_entry.oid,
      'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION,TRUNCATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION,TRIGGER WITH GRANT OPTION,MAINTAIN WITH GRANT OPTION'
    )
    OR pg_catalog.has_any_column_privilege(
      runtime_role.oid,
      catalog_entry.oid,
      'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION'
    )
    )
)
SELECT
  NOT EXISTS (SELECT 1 FROM unsafe_large_object_catalog_state)
    AS large_object_catalog_boundary_safe,
  (SELECT count(*) FROM unsafe_large_object_catalog_state)
    AS large_object_catalog_violation_count
\gset

\if :large_object_catalog_boundary_safe
\else
  \echo PostgreSQL runtime provisioning refused unsafe large object catalog ACL state count=:large_object_catalog_violation_count.
  DO $large_object_catalog_refusal$
  BEGIN
    RAISE EXCEPTION 'unsafe large object catalog ACL state';
  END
  $large_object_catalog_refusal$;
\endif

WITH runtime_role AS (
  SELECT oid
  FROM pg_catalog.pg_roles
  WHERE rolname = :'runtime_user'
), current_database_entry AS (
  SELECT oid, datdba
  FROM pg_catalog.pg_database
  WHERE datname = current_database()
), unsafe_large_object_state AS (
  SELECT 1
  FROM pg_catalog.pg_largeobject_metadata AS large_object
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(
      large_object.lomacl,
      pg_catalog.acldefault('L', large_object.lomowner)
    )
  ) AS privilege
  WHERE large_object.lomowner = (SELECT oid FROM runtime_role)
    OR privilege.grantee = 0
    OR privilege.grantee = (SELECT oid FROM runtime_role)
  UNION ALL
  SELECT 1
  FROM pg_catalog.pg_default_acl AS default_acl
  CROSS JOIN current_database_entry
  CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
  WHERE default_acl.defaclobjtype = 'L'
    AND default_acl.defaclrole <> current_database_entry.datdba
    AND (
      privilege.grantee = 0
      OR privilege.grantee = (SELECT oid FROM runtime_role)
    )
  UNION ALL
  SELECT 1
  FROM pg_catalog.pg_proc AS routine_entry
  JOIN pg_catalog.pg_namespace AS namespace_entry
    ON namespace_entry.oid = routine_entry.pronamespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(routine_entry.proacl, pg_catalog.acldefault('f', routine_entry.proowner))
  ) AS privilege
  WHERE namespace_entry.nspname = 'pg_catalog'
    AND (
      routine_entry.proname ~ '^lo_'
      OR routine_entry.proname IN ('loread', 'lowrite')
    )
    AND (
      privilege.grantee = (SELECT oid FROM runtime_role)
      OR (
        privilege.grantee = 0
        AND (privilege.privilege_type <> 'EXECUTE' OR privilege.is_grantable)
      )
    )
)
SELECT
  NOT EXISTS (SELECT 1 FROM unsafe_large_object_state) AS large_object_boundary_safe,
  (SELECT count(*) FROM unsafe_large_object_state) AS large_object_violation_count
\gset

\if :large_object_boundary_safe
\else
  \echo PostgreSQL runtime provisioning refused unsafe large object state count=:large_object_violation_count.
  DO $large_object_refusal$
  BEGIN
    RAISE EXCEPTION 'unsafe large object state';
  END
  $large_object_refusal$;
\endif

WITH runtime_role AS (
  SELECT oid
  FROM pg_catalog.pg_roles
  WHERE rolname = :'runtime_user'
), unsafe_parameter_acl AS (
  SELECT 1
  FROM pg_catalog.pg_parameter_acl AS parameter_acl
  CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_acl.paracl) AS privilege
  WHERE privilege.privilege_type IN ('SET', 'ALTER SYSTEM')
    AND (
      privilege.grantee = 0
      OR privilege.grantee = (SELECT oid FROM runtime_role)
    )
)
SELECT
  NOT EXISTS (SELECT 1 FROM unsafe_parameter_acl) AS parameter_boundary_safe,
  (SELECT count(*) FROM unsafe_parameter_acl) AS parameter_violation_count
\gset

\if :parameter_boundary_safe
\else
  \echo PostgreSQL runtime provisioning refused unsafe cluster parameter ACL count=:parameter_violation_count.
  DO $parameter_boundary_refusal$
  BEGIN
    RAISE EXCEPTION 'unsafe cluster parameter ACL';
  END
  $parameter_boundary_refusal$;
\endif

SELECT format(
  'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'runtime_user',
  :'runtime_password'
)
WHERE NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'runtime_user'
) \gexec

SELECT format(
  'ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT -1 PASSWORD %L',
  :'runtime_user',
  :'runtime_password'
) \gexec

SELECT format('REVOKE %I FROM %I', granted_role.rolname, :'runtime_user')
FROM pg_catalog.pg_auth_members AS membership
JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
WHERE member_role.rolname = :'runtime_user' \gexec

WITH runtime_role AS (
  SELECT oid
  FROM pg_catalog.pg_roles
  WHERE rolname = :'runtime_user'
), current_database_entry AS (
  SELECT oid, datdba
  FROM pg_catalog.pg_database
  WHERE datname = current_database()
), non_system_schemas AS (
  SELECT oid, nspname, nspowner
  FROM pg_catalog.pg_namespace
  WHERE nspname <> 'information_schema'
    AND nspname !~ '^pg_'
), privilege_bearing_types AS (
  SELECT type_entry.oid, type_entry.typnamespace, type_entry.typowner
  FROM pg_catalog.pg_type AS type_entry
  JOIN non_system_schemas AS namespace_entry
    ON namespace_entry.oid = type_entry.typnamespace
  LEFT JOIN pg_catalog.pg_class AS composite_entry
    ON composite_entry.oid = type_entry.typrelid
  WHERE type_entry.typisdefined
    AND type_entry.typelem = 0
    AND (
      type_entry.typrelid = 0
      OR composite_entry.relkind = 'c'
    )
), unsafe_boundary_state AS (
  SELECT 1
  FROM pg_catalog.pg_shdepend AS dependency
  CROSS JOIN runtime_role
  CROSS JOIN current_database_entry
  WHERE dependency.refclassid = 'pg_catalog.pg_authid'::regclass
    AND dependency.refobjid = runtime_role.oid
    AND dependency.deptype = 'o'
    AND (
      dependency.dbid = current_database_entry.oid
      OR (
        dependency.dbid = 0
        AND dependency.classid = 'pg_catalog.pg_database'::regclass
        AND dependency.objid = current_database_entry.oid
      )
    )
  UNION ALL
  SELECT 1
  FROM non_system_schemas AS namespace_entry
  CROSS JOIN runtime_role
  WHERE namespace_entry.nspname <> 'public'
    AND (
      namespace_entry.nspowner = runtime_role.oid
      OR pg_catalog.has_schema_privilege(
        :'runtime_user',
        namespace_entry.oid,
        'USAGE,CREATE'
      )
    )
  UNION ALL
  SELECT 1
  FROM pg_catalog.pg_class AS relation_entry
  JOIN non_system_schemas AS namespace_entry
    ON namespace_entry.oid = relation_entry.relnamespace
  CROSS JOIN runtime_role
  WHERE namespace_entry.nspname <> 'public'
    AND (
      relation_entry.relowner = runtime_role.oid
      OR (
        relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND pg_catalog.has_table_privilege(
          :'runtime_user',
          relation_entry.oid,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
        )
      )
      OR (
        relation_entry.relkind = 'S'
        AND pg_catalog.has_sequence_privilege(
          :'runtime_user',
          relation_entry.oid,
          'USAGE,SELECT,UPDATE'
        )
      )
    )
  UNION ALL
  SELECT 1
  FROM pg_catalog.pg_attribute AS attribute_entry
  JOIN pg_catalog.pg_class AS relation_entry
    ON relation_entry.oid = attribute_entry.attrelid
  JOIN non_system_schemas AS namespace_entry
    ON namespace_entry.oid = relation_entry.relnamespace
  WHERE namespace_entry.nspname <> 'public'
    AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND attribute_entry.attnum > 0
    AND NOT attribute_entry.attisdropped
    AND pg_catalog.has_column_privilege(
      :'runtime_user',
      relation_entry.oid,
      attribute_entry.attnum,
      'SELECT,INSERT,UPDATE,REFERENCES'
    )
  UNION ALL
  SELECT 1
  FROM pg_catalog.pg_proc AS routine_entry
  JOIN non_system_schemas AS namespace_entry
    ON namespace_entry.oid = routine_entry.pronamespace
  CROSS JOIN runtime_role
  WHERE namespace_entry.nspname <> 'public'
    AND (
      routine_entry.proowner = runtime_role.oid
      OR pg_catalog.has_function_privilege(
        :'runtime_user',
        routine_entry.oid,
        'EXECUTE'
      )
    )
  UNION ALL
  SELECT 1
  FROM privilege_bearing_types AS type_entry
  JOIN non_system_schemas AS namespace_entry
    ON namespace_entry.oid = type_entry.typnamespace
  CROSS JOIN runtime_role
  WHERE namespace_entry.nspname <> 'public'
    AND (
      type_entry.typowner = runtime_role.oid
      OR pg_catalog.has_type_privilege(
        :'runtime_user',
        type_entry.oid,
        'USAGE'
      )
    )
  UNION ALL
  SELECT 1
  FROM pg_catalog.pg_default_acl AS default_acl
  LEFT JOIN non_system_schemas AS namespace_entry
    ON namespace_entry.oid = default_acl.defaclnamespace
  CROSS JOIN runtime_role
  CROSS JOIN current_database_entry
  CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
  WHERE privilege.grantee IN (0, runtime_role.oid)
    AND (
      default_acl.defaclnamespace = 0
      OR namespace_entry.oid IS NOT NULL
    )
    AND NOT (
      default_acl.defaclrole = current_database_entry.datdba
      AND (
        (
          default_acl.defaclnamespace = 0
          AND default_acl.defaclobjtype IN ('r', 'S', 'f', 'T', 'L')
        )
        OR (
          namespace_entry.nspname = 'public'
          AND default_acl.defaclobjtype IN ('r', 'S', 'f', 'T')
        )
      )
    )
)
SELECT
  NOT EXISTS (SELECT 1 FROM unsafe_boundary_state) AS database_boundary_safe,
  (SELECT count(*) FROM unsafe_boundary_state) AS boundary_violation_count
\gset

\if :database_boundary_safe
\else
  \echo PostgreSQL runtime provisioning refused unsafe pre-existing database state count=:boundary_violation_count.
  DO $boundary_refusal$
  BEGIN
    RAISE EXCEPTION 'unsafe pre-existing database state';
  END
  $boundary_refusal$;
\endif

SELECT format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I', current_database(), :'runtime_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'runtime_user') \gexec
SELECT format('ALTER ROLE %I RESET ALL', :'runtime_user') \gexec
SELECT format(
  'ALTER ROLE %I IN DATABASE %I RESET ALL',
  :'runtime_user',
  current_database()
) \gexec
SELECT format(
  'ALTER ROLE %I IN DATABASE %I SET search_path = pg_catalog, public',
  :'runtime_user',
  current_database()
) \gexec

REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;
SELECT format('REVOKE ALL PRIVILEGES ON SCHEMA public FROM %I', :'runtime_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'runtime_user') \gexec

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
SELECT format('REVOKE ALL PRIVILEGES ON TYPE %I.%I FROM PUBLIC', namespace_entry.nspname, type_entry.typname)
FROM pg_catalog.pg_type AS type_entry
JOIN pg_catalog.pg_namespace AS namespace_entry
  ON namespace_entry.oid = type_entry.typnamespace
LEFT JOIN pg_catalog.pg_class AS composite_entry
  ON composite_entry.oid = type_entry.typrelid
WHERE namespace_entry.nspname = 'public'
  AND type_entry.typisdefined
  AND type_entry.typelem = 0
  AND (type_entry.typrelid = 0 OR composite_entry.relkind = 'c') \gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', :'runtime_user') \gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', :'runtime_user') \gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM %I', :'runtime_user') \gexec
SELECT format(
  'REVOKE ALL PRIVILEGES ON TYPE %I.%I FROM %I',
  namespace_entry.nspname,
  type_entry.typname,
  :'runtime_user'
)
FROM pg_catalog.pg_type AS type_entry
JOIN pg_catalog.pg_namespace AS namespace_entry
  ON namespace_entry.oid = type_entry.typnamespace
LEFT JOIN pg_catalog.pg_class AS composite_entry
  ON composite_entry.oid = type_entry.typrelid
WHERE namespace_entry.nspname = 'public'
  AND type_entry.typisdefined
  AND type_entry.typelem = 0
  AND (type_entry.typrelid = 0 OR composite_entry.relkind = 'c') \gexec

SELECT format(
  'REVOKE %s (%I) ON TABLE %I.%I FROM PUBLIC',
  column_privilege.privilege_type,
  attribute_entry.attname,
  namespace_entry.nspname,
  relation_entry.relname
)
FROM pg_catalog.pg_attribute AS attribute_entry
JOIN pg_catalog.pg_class AS relation_entry
  ON relation_entry.oid = attribute_entry.attrelid
JOIN pg_catalog.pg_namespace AS namespace_entry
  ON namespace_entry.oid = relation_entry.relnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS column_privilege
WHERE namespace_entry.nspname = 'public'
  AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND attribute_entry.attnum > 0
  AND NOT attribute_entry.attisdropped
  AND column_privilege.grantee = 0 \gexec

SELECT format(
  'REVOKE %s (%I) ON TABLE %I.%I FROM %I',
  column_privilege.privilege_type,
  attribute_entry.attname,
  namespace_entry.nspname,
  relation_entry.relname,
  :'runtime_user'
)
FROM pg_catalog.pg_attribute AS attribute_entry
JOIN pg_catalog.pg_class AS relation_entry
  ON relation_entry.oid = attribute_entry.attrelid
JOIN pg_catalog.pg_namespace AS namespace_entry
  ON namespace_entry.oid = relation_entry.relnamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS column_privilege
WHERE namespace_entry.nspname = 'public'
  AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND attribute_entry.attnum > 0
  AND NOT attribute_entry.attisdropped
  AND column_privilege.grantee = (
    SELECT runtime_role.oid
    FROM pg_catalog.pg_roles AS runtime_role
    WHERE runtime_role.rolname = :'runtime_user'
  ) \gexec

SELECT format('GRANT SELECT ON ALL TABLES IN SCHEMA public TO %I', :'runtime_user') \gexec

SELECT format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', routine_entry.oid::regprocedure)
FROM pg_catalog.pg_proc AS routine_entry
JOIN pg_catalog.pg_namespace AS namespace_entry
  ON namespace_entry.oid = routine_entry.pronamespace
WHERE namespace_entry.nspname = 'pg_catalog'
  AND (
    routine_entry.proname ~ '^lo_'
    OR routine_entry.proname IN ('loread', 'lowrite')
  ) \gexec
SELECT format(
  'REVOKE EXECUTE ON FUNCTION %s FROM %I',
  routine_entry.oid::regprocedure,
  :'runtime_user'
)
FROM pg_catalog.pg_proc AS routine_entry
JOIN pg_catalog.pg_namespace AS namespace_entry
  ON namespace_entry.oid = routine_entry.pronamespace
WHERE namespace_entry.nspname = 'pg_catalog'
  AND (
    routine_entry.proname ~ '^lo_'
    OR routine_entry.proname IN ('loread', 'lowrite')
  ) \gexec

ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TYPES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON LARGE OBJECTS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TYPES FROM PUBLIC;
SELECT format(
  'ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TABLES FROM %I',
  :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
  :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON FUNCTIONS FROM %I',
  :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TYPES FROM %I',
  :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON LARGE OBJECTS FROM %I',
  :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I',
  :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
  :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON FUNCTIONS FROM %I',
  :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TYPES FROM %I',
  :'runtime_user'
) \gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO %I',
  :'runtime_user'
) \gexec

COMMIT;
SQL

unset PGPASSWORD
runtime_result="$(
  PGPASSWORD="$(tr -d '\r\n' </run/secrets/postgres_runtime_password)" psql \
    --host=127.0.0.1 \
    --port=5432 \
    --username="$runtime_user" \
    --dbname="$POSTGRES_DB" \
    --no-psqlrc \
    --tuples-only \
    --no-align \
    --set=ON_ERROR_STOP=1 \
    --command="WITH runtime_role AS (SELECT oid, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user), current_database_entry AS (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database()), non_system_schemas AS (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname <> 'information_schema' AND nspname !~ '^pg_'), privilege_bearing_types AS (SELECT type_entry.oid FROM pg_catalog.pg_type AS type_entry JOIN non_system_schemas AS namespace_entry ON namespace_entry.oid = type_entry.typnamespace LEFT JOIN pg_catalog.pg_class AS composite_entry ON composite_entry.oid = type_entry.typrelid WHERE type_entry.typisdefined AND type_entry.typelem = 0 AND (type_entry.typrelid = 0 OR composite_entry.relkind = 'c')), large_object_routines AS (SELECT routine_entry.oid FROM pg_catalog.pg_proc AS routine_entry JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = routine_entry.pronamespace WHERE namespace_entry.nspname = 'pg_catalog' AND (routine_entry.proname ~ '^lo_' OR routine_entry.proname IN ('loread', 'lowrite'))) SELECT current_user = session_user AND current_setting('session_replication_role') = 'origin' AND current_setting('lo_compat_privileges') = 'off' AND NOT runtime_role.rolsuper AND NOT runtime_role.rolcreaterole AND NOT runtime_role.rolcreatedb AND NOT runtime_role.rolinherit AND NOT runtime_role.rolreplication AND NOT runtime_role.rolbypassrls AND has_database_privilege(current_user, current_database(), 'CONNECT') AND NOT has_database_privilege(current_user, current_database(), 'CONNECT WITH GRANT OPTION') AND NOT has_database_privilege(current_user, current_database(), 'CREATE') AND NOT has_database_privilege(current_user, current_database(), 'TEMPORARY') AND has_schema_privilege(current_user, 'public', 'USAGE') AND NOT has_schema_privilege(current_user, 'public', 'USAGE WITH GRANT OPTION') AND NOT has_schema_privilege(current_user, 'public', 'CREATE') AND NOT EXISTS (SELECT 1 FROM privilege_bearing_types AS type_entry WHERE has_type_privilege(current_user, type_entry.oid, 'USAGE')) AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_largeobject_metadata AS large_object WHERE large_object.lomowner = runtime_role.oid OR has_largeobject_privilege(current_user, large_object.oid, 'SELECT,UPDATE')) AND NOT EXISTS (SELECT 1 FROM large_object_routines AS routine_entry WHERE has_function_privilege(current_user, routine_entry.oid, 'EXECUTE')) AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_parameter_acl AS parameter_acl WHERE pg_catalog.has_parameter_privilege(current_user, parameter_acl.parname, 'SET') OR pg_catalog.has_parameter_privilege(current_user, parameter_acl.parname, 'ALTER SYSTEM')) AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_shdepend AS dependency CROSS JOIN current_database_entry WHERE dependency.refclassid = 'pg_catalog.pg_authid'::regclass AND dependency.refobjid = runtime_role.oid AND dependency.deptype = 'o' AND (dependency.dbid = current_database_entry.oid OR (dependency.dbid = 0 AND dependency.classid = 'pg_catalog.pg_database'::regclass AND dependency.objid = current_database_entry.oid))) FROM runtime_role;"
)"

if [ "$runtime_result" != 't' ]; then
  echo 'PostgreSQL runtime boundary verification failed.' >&2
  exit 1
fi

large_object_catalog_result="$(
  PGPASSWORD="$(tr -d '\r\n' </run/secrets/postgres_runtime_password)" psql \
    --host=127.0.0.1 \
    --port=5432 \
    --username="$runtime_user" \
    --dbname="$POSTGRES_DB" \
    --no-psqlrc \
    --tuples-only \
    --no-align \
    --set=ON_ERROR_STOP=1 \
    --command="WITH large_object_catalogs AS (SELECT relation_entry.oid, relation_entry.relname FROM pg_catalog.pg_class AS relation_entry JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = relation_entry.relnamespace WHERE namespace_entry.nspname = 'pg_catalog' AND relation_entry.relname IN ('pg_largeobject', 'pg_largeobject_metadata')) SELECT NOT EXISTS (SELECT 1 FROM large_object_catalogs AS catalog_entry WHERE (catalog_entry.relname = 'pg_largeobject' AND (has_table_privilege(current_user, catalog_entry.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(current_user, catalog_entry.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))) OR (catalog_entry.relname = 'pg_largeobject_metadata' AND (has_table_privilege(current_user, catalog_entry.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(current_user, catalog_entry.oid, 'INSERT,UPDATE,REFERENCES'))) OR has_table_privilege(current_user, catalog_entry.oid, 'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION,TRUNCATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION,TRIGGER WITH GRANT OPTION,MAINTAIN WITH GRANT OPTION') OR has_any_column_privilege(current_user, catalog_entry.oid, 'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION'));"
)"

if [ "$large_object_catalog_result" != 't' ]; then
  echo 'PostgreSQL runtime large object catalog boundary verification failed.' >&2
  exit 1
fi

echo 'PostgreSQL runtime boundary provisioned and verified.'
