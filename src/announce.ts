import { db } from "./db";
import type { User } from "./auth";
import { esc, nl2br, formatDateTime } from "./util";
import { card, emptyState } from "./ui";

// Ambil pengumuman yang terlihat oleh user ini.
export function visibleFor(user: User, limit = 8): any[] {
  const where: string[] = [];
  const params: any[] = [];

  if (user.role === "admin" || user.role === "kepala_sekolah") {
    // admin & kepala sekolah melihat semua pengumuman
  } else {
    where.push("p.target = 'semua'");
    if (user.role === "siswa") {
      where.push("(p.target = 'kelas' AND p.kelas_id = (SELECT kelas_id FROM siswa WHERE user_id = ?))");
      params.push(user.id);
    } else if (user.role === "orang_tua") {
      where.push("(p.target = 'kelas' AND p.kelas_id = (SELECT s.kelas_id FROM orang_tua o JOIN siswa s ON s.id = o.siswa_id WHERE o.user_id = ?))");
      params.push(user.id);
    } else if (user.role === "guru") {
      // guru melihat pengumuman umum + pengumuman yang dia buat sendiri
      where.push("p.author_id = ?");
      params.push(user.id);
    }
  }

  const sql = `
    SELECT p.*, k.nama AS kelas_nama
    FROM pengumuman p LEFT JOIN kelas k ON k.id = p.kelas_id
    ${where.length ? "WHERE " + where.join(" OR ") : ""}
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT ?
  `;
  params.push(limit);
  return db.query(sql).all(...params) as any[];
}

export function pengumumanList(rows: any[]): string {
  if (!rows.length) return emptyState("Belum ada pengumuman.");
  return `<div class="pengumuman-list">${rows.map((p) => `
    <div class="pengumuman-item">
      <div class="pengumuman-head">
        <b>📢 ${esc(p.judul)}</b>
        <span class="muted">${formatDateTime(p.created_at)}</span>
      </div>
      <div class="pengumuman-body">${nl2br(p.isi)}</div>
      <div class="pengumuman-meta">
        <span class="pill ${p.target === "semua" ? "" : "pill-live"}">${p.target === "semua" ? "🌐 Semua" : "🎓 Kelas " + esc(p.kelas_nama ?? "-")}</span>
        <span class="muted">oleh ${esc(p.author_nama)}</span>
      </div>
    </div>`).join("")}</div>`;
}

export function pengumumanCard(rows: any[], action = ""): string {
  return card("📢 Pengumuman", pengumumanList(rows), { action });
}
