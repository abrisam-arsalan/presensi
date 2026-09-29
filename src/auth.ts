import { db } from "./db";
import { nowSql } from "./util";
import { createHmac } from "node:crypto";

export interface User {
  id: number;
  username: string;
  nama: string;
  role: string;
}

export async function hashPassword(pw: string): Promise<string> {
  return Bun.password.hash(pw);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return Bun.password.verify(pw, hash);
}

export const SESSION_COOKIE = "sk_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

export function createSession(userId: number): string {
  const token = crypto.randomUUID();
  db.run("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)", [
    token, userId, nowSql(), Date.now() + SESSION_TTL_MS,
  ]);
  return token;
}

export function getSessionUser(token: string | null): User | null {
  return getSession(token)?.user ?? null;
}

export function deleteSession(token: string) {
  db.run("DELETE FROM sessions WHERE token = ?", [token]);
}

export function csrfToken(sessionToken: string): string {
  return createHmac("sha256", "sk-csrf-v1").update(sessionToken).digest("hex");
}

export function validateCsrf(formData: FormData, csrf: string | null): string | null {
  if (!csrf) return "Sesi tidak valid, silakan login ulang.";
  const token = formData.get("_csrf");
  if (token !== csrf) return "Token keamanan (CSRF) tidak valid.";
  return null;
}

export function getSession(token: string | null): { user: User; csrf: string } | null {
  if (!token) return null;
  const row = db.query(`
    SELECT u.id, u.username, u.nama, u.role, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token) as { id: number; username: string; nama: string; role: string; expires_at: number } | null;
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    deleteSession(token);
    return null;
  }
  const user = { id: row.id, username: row.username, nama: row.nama, role: row.role };
  return { user, csrf: csrfToken(token) };
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// ---------- Rate limiting login ----------
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 menit
const LOGIN_MAX_ATTEMPTS = 5;

interface LoginAttemptRecord {
  count: number;
  firstAttempt: number;
  blockedUntil?: number;
}

const loginAttempts = new Map<string, LoginAttemptRecord>();

export function checkLoginRateLimit(ip: string): string | null {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec) return null;
  if (rec.blockedUntil && rec.blockedUntil > now) {
    const mins = Math.ceil((rec.blockedUntil - now) / 60000);
    return `Terlalu banyak percobaan gagal. Coba lagi dalam ${mins} menit.`;
  }
  if (rec.firstAttempt < now - LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
  }
  return null;
}

export function recordLoginFailure(ip: string) {
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || rec.firstAttempt < now - LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return;
  }
  rec.count++;
  if (rec.count >= LOGIN_MAX_ATTEMPTS) {
    rec.blockedUntil = now + LOGIN_WINDOW_MS;
  }
}

export function recordLoginSuccess(ip: string) {
  loginAttempts.delete(ip);
}
