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
    AND (
      default_acl.defaclrole <> current_database_entry.datdba
      OR (
        default_acl.defaclnamespace <> 0
        AND namespace_entry.nspname <> 'public'
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

ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON TYPES FROM PUBLIC;
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
    --command="WITH runtime_role AS (SELECT oid, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user), current_database_entry AS (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database()), non_system_schemas AS (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname <> 'information_schema' AND nspname !~ '^pg_'), privilege_bearing_types AS (SELECT type_entry.oid FROM pg_catalog.pg_type AS type_entry JOIN non_system_schemas AS namespace_entry ON namespace_entry.oid = type_entry.typnamespace LEFT JOIN pg_catalog.pg_class AS composite_entry ON composite_entry.oid = type_entry.typrelid WHERE type_entry.typisdefined AND type_entry.typelem = 0 AND (type_entry.typrelid = 0 OR composite_entry.relkind = 'c')) SELECT current_user = session_user AND NOT runtime_role.rolsuper AND NOT runtime_role.rolcreaterole AND NOT runtime_role.rolcreatedb AND NOT runtime_role.rolinherit AND NOT runtime_role.rolreplication AND NOT runtime_role.rolbypassrls AND has_database_privilege(current_user, current_database(), 'CONNECT') AND NOT has_database_privilege(current_user, current_database(), 'CONNECT WITH GRANT OPTION') AND NOT has_database_privilege(current_user, current_database(), 'CREATE') AND NOT has_database_privilege(current_user, current_database(), 'TEMPORARY') AND has_schema_privilege(current_user, 'public', 'USAGE') AND NOT has_schema_privilege(current_user, 'public', 'USAGE WITH GRANT OPTION') AND NOT has_schema_privilege(current_user, 'public', 'CREATE') AND NOT EXISTS (SELECT 1 FROM privilege_bearing_types AS type_entry WHERE has_type_privilege(current_user, type_entry.oid, 'USAGE')) AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_parameter_acl AS parameter_acl WHERE pg_catalog.has_parameter_privilege(current_user, parameter_acl.parname, 'SET') OR pg_catalog.has_parameter_privilege(current_user, parameter_acl.parname, 'ALTER SYSTEM')) AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_shdepend AS dependency CROSS JOIN current_database_entry WHERE dependency.refclassid = 'pg_catalog.pg_authid'::regclass AND dependency.refobjid = runtime_role.oid AND dependency.deptype = 'o' AND (dependency.dbid = current_database_entry.oid OR (dependency.dbid = 0 AND dependency.classid = 'pg_catalog.pg_database'::regclass AND dependency.objid = current_database_entry.oid))) FROM runtime_role;"
)"

if [ "$runtime_result" != 't' ]; then
  echo 'PostgreSQL runtime boundary verification failed.' >&2
  exit 1
fi

echo 'PostgreSQL runtime boundary provisioned and verified.'
