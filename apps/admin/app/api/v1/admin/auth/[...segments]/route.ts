import { proxyAdminAuthRequest } from '../../../../../../lib/auth/admin-auth-proxy';

export const dynamic = 'force-dynamic';

function handle(request: Request): Promise<Response> {
  return proxyAdminAuthRequest(request);
}

export const DELETE = handle;
export const GET = handle;
export const POST = handle;

export function HEAD(): Response {
  return new Response(null, {
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    status: 404,
  });
}

export function OPTIONS(): Response {
  return new Response(null, {
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    status: 404,
  });
}
