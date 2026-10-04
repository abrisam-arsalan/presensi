import { add } from "../router";
import { html, redirect, readForm, getCookies } from "../http";
import { createSession, verifyPassword, deleteSession, sessionCookie, clearSessionCookie, SESSION_COOKIE, checkLoginRateLimit, recordLoginFailure, recordLoginSuccess } from "../auth";
import { db } from "../db";
import { esc, homeFor } from "../util";
import { APP_NAME, APP_TAGLINE } from "../ui";

function loginPage(error?: string): Response {
  const err = error ? `<div class="alert alert-error">${esc(error)}</div>` : "";
  const body = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#FFD43B">
<link rel="icon" type="image/png" href="/assets/logo.png">
<title>Login · ${APP_NAME}</title>
<link rel="stylesheet" href="/assets/style.css?v=9">
</head>
<body class="role-guest">
<div class="auth-wrap">
  <form class="auth-card" method="post" action="/login">
    <img class="auth-logo" src="/assets/logo.png" alt="Logo">
    <h1>${APP_NAME}</h1>
    <p class="auth-sub">${APP_TAGLINE}</p>
    ${err}
    <label class="field"><span class="field-label">Username</span>
      <input class="input" type="text" name="username" placeholder="username" autocomplete="username" required autofocus>
    </label>
    <label class="field"><span class="field-label">Password</span>
      <input class="input" type="password" name="password" placeholder="••••••••" autocomplete="current-password" required>
    </label>
    <button class="btn btn-primary btn-block" type="submit">Masuk</button>
  </form>
</div>
</body>
</html>`;
  return html(body);
}

export function registerAuth() {
  add("GET", "/login", (req, ctx) => {
    if (ctx.user) return redirect(homeFor(ctx.user.role));
    return loginPage();
  });

  add("POST", "/login", async (req, ctx) => {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const limitErr = checkLoginRateLimit(ip);
    if (limitErr) return loginPage(limitErr);
    const f = await readForm(req);
    const username = (f.get("username") ?? "").trim();
    const password = f.get("password") ?? "";
    const row = db.query("SELECT * FROM users WHERE username = ?").get(username) as
      | { id: number; username: string; nama: string; role: string; password_hash: string }
      | null;
    if (!row) {
      recordLoginFailure(ip);
      return loginPage("Username atau password salah.");
    }
    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) {
      recordLoginFailure(ip);
      return loginPage("Username atau password salah.");
    }
    recordLoginSuccess(ip);
    const token = createSession(row.id);
    return redirect(homeFor(row.role), { "Set-Cookie": sessionCookie(token) });
  });

  add("ALL", "/logout", (req, ctx) => {
    const cookies = getCookies(req);
    const t = cookies[SESSION_COOKIE];
    if (t) deleteSession(t);
    return redirect("/login", { "Set-Cookie": clearSessionCookie() });
  });
}
