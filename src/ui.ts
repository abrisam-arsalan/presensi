import { esc, roleLabel } from "./util";
import type { User } from "./auth";

export const APP_NAME = "Panglima App";
export const APP_TAGLINE = "Rekap Kehadiran Siswa";

interface NavItem {
  href: string;
  icon: string;
  label: string;
}

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", icon: "🏠", label: "Dashboard" },
  { href: "/admin/jadwal", icon: "🗓️", label: "Jadwal" },
  { href: "/admin/rekap", icon: "📊", label: "Rekap Kehadiran" },
  { href: "/admin/kelas", icon: "🏫", label: "Kelas" },
  { href: "/admin/mapel", icon: "📚", label: "Mata Pelajaran" },
  { href: "/admin/guru", icon: "👨‍🏫", label: "Guru" },
  { href: "/admin/siswa", icon: "🎓", label: "Siswa" },
  { href: "/admin/ortu", icon: "👨‍👩‍👧", label: "Orang Tua" },
  { href: "/admin/user", icon: "👤", label: "Pengguna" },
];

const KEPALA_NAV: NavItem[] = [
  { href: "/kepala", icon: "🏠", label: "Beranda" },
  { href: "/kepala/jadwal", icon: "🗓️", label: "Jadwal" },
  { href: "/kepala/rekap", icon: "📊", label: "Rekap" },
  { href: "/kepala/data", icon: "📁", label: "Data" },
];

const GURU_NAV: NavItem[] = [
  { href: "/guru", icon: "🏠", label: "Beranda" },
  { href: "/guru/riwayat", icon: "🕘", label: "Riwayat" },
];

const SISWA_NAV: NavItem[] = [
  { href: "/siswa", icon: "🏠", label: "Beranda" },
  { href: "/siswa/kehadiran", icon: "✅", label: "Kehadiran" },
  { href: "/siswa/materi", icon: "📖", label: "Materi" },
];

const ORTU_NAV: NavItem[] = [
  { href: "/orangtua", icon: "🏠", label: "Beranda" },
  { href: "/orangtua/kehadiran", icon: "✅", label: "Kehadiran" },
  { href: "/orangtua/materi", icon: "📖", label: "Materi" },
];

function navFor(role: string): NavItem[] {
  switch (role) {
    case "admin": return ADMIN_NAV;
    case "kepala_sekolah": return KEPALA_NAV;
    case "guru": return GURU_NAV;
    case "siswa": return SISWA_NAV;
    case "orang_tua": return ORTU_NAV;
    default: return [];
  }
}

function homeFor(role: string): string {
  const map: Record<string, string> = {
    admin: "/admin",
    kepala_sekolah: "/kepala",
    guru: "/guru",
    siswa: "/siswa",
    orang_tua: "/orangtua",
  };
  return map[role] ?? "/login";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

export function page(opts: { title: string; ctx: Ctx; content: string; active?: string }): string {
  const user = opts.ctx.user!;
  const nav = navFor(user.role);
  const isAdmin = user.role === "admin";

  const sidebar = isAdmin
    ? `<aside class="sidebar">
        <nav class="side-nav">
          ${nav.map((n) => `<a class="side-item ${opts.active === n.href ? "active" : ""}" href="${n.href}"><span class="ico">${n.icon}</span><span>${n.label}</span></a>`).join("")}
        </nav>
      </aside>`
    : "";

  const bottomNav = !isAdmin
    ? `<nav class="bottomnav">
        ${nav.map((n) => `<a class="bn-item ${opts.active === n.href ? "active" : ""}" href="${n.href}"><span class="ico">${n.icon}</span><span>${n.label}</span></a>`).join("")}
      </nav>`
    : "";

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#FFD43B">
<meta name="csrf-token" content="${esc(opts.ctx.csrf ?? "")}">
<link rel="icon" type="image/png" href="/assets/logo.png">
<title>${esc(opts.title)} · ${APP_NAME}</title>
<link rel="stylesheet" href="/assets/style.css?v=10">
</head>
<body class="role-${esc(user.role)}">
<header class="topbar">
  <a class="brand" href="${homeFor(user.role)}"><img class="brand-logo" src="/assets/logo.png" alt="Logo"><span class="brand-text">${APP_NAME}<small>${APP_TAGLINE}</small></span></a>
  <div class="topbar-right">
    <div class="userchip">
      <span class="avatar">${esc(initials(user.nama))}</span>
      <span class="user-meta"><b>${esc(user.nama)}</b><small>${roleLabel(user.role)}</small></span>
    </div>
    <a class="btn btn-ghost btn-sm" href="/logout">Keluar</a>
  </div>
</header>
<div class="layout ${isAdmin ? "layout-admin" : ""}">
  ${sidebar}
  <main class="content">${opts.content}</main>
</div>
${bottomNav}
<script src="/assets/app.js?v=3"></script>
</body>
</html>`;
}

// ---------- Komponen UI ----------

export function card(title: string, body: string, opts: { action?: string; cls?: string } = {}): string {
  return `<section class="card ${opts.cls ?? ""}">
    <div class="card-head"><h2>${title}</h2>${opts.action ?? ""}</div>
    <div class="card-body">${body}</div>
  </section>`;
}

export function statCard(label: string, value: number | string, icon: string, tone = ""): string {
  return `<div class="stat ${tone}"><span class="stat-icon">${icon}</span><div><div class="stat-value">${value}</div><div class="stat-label">${esc(label)}</div></div></div>`;
}

export function badge(status: string): string {
  const cls: Record<string, string> = {
    hadir: "badge-hadir",
    sakit: "badge-sakit",
    izin: "badge-izin",
    alpha: "badge-alpha",
    selesai: "badge-selesai",
    dibuka: "badge-dibuka",
  };
  const labels: Record<string, string> = {
    hadir: "Hadir",
    sakit: "Sakit",
    izin: "Izin",
    alpha: "Alpa",
    selesai: "Selesai",
    dibuka: "Dibuka",
  };
  return `<span class="badge ${cls[status] ?? "badge-neutral"}">${labels[status] ?? esc(status)}</span>`;
}

export function table(headers: string[], rows: string[][]): string {
  return `<div class="table-wrap"><table class="table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

export function emptyState(msg: string): string {
  return `<div class="empty">📭 ${esc(msg)}</div>`;
}

export function alert(msg: string, type: "success" | "error" | "info" = "info"): string {
  return `<div class="alert alert-${type}">${msg}</div>`;
}

// ---------- Form helper ----------

export function field(label: string, inputHtml: string): string {
  return `<label class="field"><span class="field-label">${label}</span>${inputHtml}</label>`;
}

export function input(name: string, value = "", opts: { type?: string; placeholder?: string; required?: boolean; step?: string } = {}): string {
  const attrs = [
    `class="input"`,
    `type="${opts.type ?? "text"}"`,
    `name="${esc(name)}"`,
    `value="${esc(value)}"`,
    opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : "",
    opts.required ? "required" : "",
    opts.step ? `step="${opts.step}"` : "",
  ].filter(Boolean).join(" ");
  return `<input ${attrs}>`;
}

export function select(name: string, options: { value: string | number; label: string }[], selected?: string | number): string {
  const sel = selected === undefined ? "" : String(selected);
  return `<select class="input" name="${esc(name)}">${options.map((o) => `<option value="${esc(String(o.value))}" ${String(o.value) === sel ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
}

export function textarea(name: string, value = "", rows = 4, placeholder = ""): string {
  return `<textarea class="input" name="${esc(name)}" rows="${rows}" ${placeholder ? `placeholder="${esc(placeholder)}"` : ""}>${esc(value)}</textarea>`;
}

export function button(label: string, opts: { type?: string; tone?: string; name?: string; value?: string; confirm?: string } = {}): string {
  const attrs = [
    `class="btn ${opts.tone ? `btn-${opts.tone}` : ""}"`,
    `type="${opts.type ?? "submit"}"`,
    opts.name ? `name="${esc(opts.name)}"` : "",
    opts.value !== undefined ? `value="${esc(opts.value)}"` : "",
    opts.confirm ? `data-confirm="${esc(opts.confirm)}"` : "",
  ].filter(Boolean).join(" ");
  return `<button ${attrs}>${label}</button>`;
}

export function linkBtn(href: string, label: string, tone = ""): string {
  return `<a class="btn ${tone ? `btn-${tone}` : ""}" href="${href}">${label}</a>`;
}

export function formGrid(fields: string, actions: string): string {
  return `<div class="form-grid">${fields}</div><div class="form-actions">${actions}</div>`;
}
