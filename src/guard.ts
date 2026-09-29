import type { User } from "./auth";
import type { Ctx } from "./router";
import { redirect } from "./http";
import { homeFor } from "./util";

// Mengembalikan User jika login & role cocok, atau Response redirect.
export function requireRole(ctx: Ctx, ...roles: string[]): User | Response {
  if (!ctx.user) return redirect("/login");
  if (!roles.includes(ctx.user.role)) return redirect(homeFor(ctx.user.role));
  return ctx.user;
}
