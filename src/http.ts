export function html(body: string, status = 200, headers?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...(headers ?? {}) },
  });
}

export function redirect(location: string, headers?: Record<string, string>): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, ...(headers ?? {}) },
  });
}

export function getCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const h = req.headers.get("cookie");
  if (!h) return out;
  for (const part of h.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export async function readForm(req: Request): Promise<URLSearchParams> {
  const text = await req.text();
  return new URLSearchParams(text);
}
