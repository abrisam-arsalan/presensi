import type { User } from "./auth";
import { getSession, SESSION_COOKIE } from "./auth";
import { getCookies } from "./http";

export interface Ctx {
  params: Record<string, string>;
  query: URLSearchParams;
  user: User | null;
  csrf: string | null;
}

export type Handler = (req: Request, ctx: Ctx) => Response | Promise<Response>;

interface Route {
  method: string;
  path: string;
  handler: Handler;
}

const routes: Route[] = [];

export function add(method: string, path: string, handler: Handler) {
  routes.push({ method: method.toUpperCase(), path, handler });
}

function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const q = pathname.split("/").filter(Boolean);
  if (p.length !== q.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) {
      params[p[i].slice(1)] = decodeURIComponent(q[i]);
    } else if (p[i] !== q[i]) {
      return null;
    }
  }
  return params;
}

export async function dispatch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method.toUpperCase();
  const cookies = getCookies(req);
  const session = getSession(cookies[SESSION_COOKIE] ?? null);

  for (const r of routes) {
    if (r.method !== method && r.method !== "ALL") continue;
    const params = matchPath(r.path, pathname);
    if (params === null) continue;
    return await r.handler(req, { params, query: url.searchParams, user: session?.user ?? null, csrf: session?.csrf ?? null });
  }

  return new Response("404 Not Found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
