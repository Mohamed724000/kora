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
SELECT format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', :'runtime_user') \gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', :'runtime_user') \gexec
SELECT format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM %I', :'runtime_user') \gexec

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
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC;
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
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO %I',
  :'runtime_user'
) \gexec
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
    --command="SELECT current_user = session_user AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls AND has_database_privilege(current_user, current_database(), 'CONNECT') AND NOT has_database_privilege(current_user, current_database(), 'CREATE') AND NOT has_database_privilege(current_user, current_database(), 'TEMPORARY') AND has_schema_privilege(current_user, 'public', 'USAGE') AND NOT has_schema_privilege(current_user, 'public', 'CREATE') FROM pg_catalog.pg_roles WHERE rolname = current_user;"
)"

if [ "$runtime_result" != 't' ]; then
  echo 'PostgreSQL runtime boundary verification failed.' >&2
  exit 1
fi

echo 'PostgreSQL runtime boundary provisioned and verified.'
