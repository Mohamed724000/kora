import { defineConfig } from 'prisma/config';

function valueOrFallback(value: string | undefined, fallback: string): string {
  return value === undefined || value.length === 0 ? fallback : value;
}

function datasourceUrl(environment: NodeJS.ProcessEnv): string {
  const username = encodeURIComponent(valueOrFallback(environment.DATABASE_USER, 'generate'));
  const password = encodeURIComponent(valueOrFallback(environment.DATABASE_PASSWORD, 'generate'));
  const host = valueOrFallback(environment.DATABASE_HOST, '127.0.0.1');
  const port = valueOrFallback(environment.DATABASE_PORT, '5432');
  const database = encodeURIComponent(valueOrFallback(environment.DATABASE_NAME, 'generate'));

  return `postgresql://${username}:${password}@${host}:${port}/${database}`;
}

export default defineConfig({
  datasource: {
    url: datasourceUrl(process.env),
  },
  schema: 'prisma/schema.prisma',
});
