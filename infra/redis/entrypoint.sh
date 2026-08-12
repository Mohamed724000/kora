#!/bin/sh

set -eu

secret_file="/run/secrets/redis_password"
config_file="/run/kora-redis/redis.conf"

if [ ! -r "$secret_file" ]; then
  echo "Redis secret file is unavailable." >&2
  exit 1
fi

password="$(cat "$secret_file")"

case "$password" in
  *[!A-Za-z0-9_-]* | "")
    echo "Redis secret file has an invalid format." >&2
    exit 1
    ;;
esac

umask 077
{
  echo "bind 0.0.0.0"
  echo "protected-mode yes"
  echo "port 6379"
  echo "dir /data"
  echo "appendonly yes"
  echo "appenddirname appendonlydir"
  echo "save 60 1"
  printf 'requirepass %s\n' "$password"
} >"$config_file"

unset password

exec redis-server "$config_file"
