import { add, type Ctx } from "../router";
import { html } from "../http";
import { db } from "../db";
import { esc, nl2br, formatDate } from "../util";
import { page, card, table, badge, emptyState, statCard, alert } from "../ui";
import { requireRole } from "../guard";
import type { User } from "../auth";
import { visibleFor, pengumumanCard } from "../announce";

function wrap(ctx: Ctx, title: string, active: string, content: string): Response {
  return html(page({ title, ctx, content, active }));
}

function getAnak(userId: number) {
  return db.query(`
    SELECT o.nama AS ortu_nama, o.hubungan, s.id AS siswa_id, s.nis, s.nama AS siswa_nama, k.nama AS kelas_nama, k.id AS kelas_id
    FROM orang_tua o JOIN siswa s ON s.id = o.siswa_id LEFT JOIN kelas k ON k.id = s.kelas_id
    WHERE o.user_id=?
  `).get(userId) as any;
}

function statusSummary(siswaId: number): Record<string, number> {
  const rows = db.query("SELECT k.status, COUNT(*) c FROM kehadiran k WHERE k.siswa_id=? GROUP BY k.status").all(siswaId) as { status: string; c: number }[];
  const sc: Record<string, number> = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
  for (const r of rows) sc[r.status] = r.c;
  return sc;
}

function materiList(kelasId: number, limit = 0): any[] {
  const lim = limit ? `LIMIT ${limit}` : "";
  return db.query(`
    SELECT s.tanggal, s.materi, s.catatan_kelas, mp.nama AS mapel_nama, g.nama AS guru_nama, j.jam_mulai
    FROM sesi_mengajar s JOIN jadwal j ON j.id=s.jadwal_id
    JOIN mata_pelajaran mp ON mp.id=j.mata_pelajaran_id
    JOIN guru g ON g.id=j.guru_id
    WHERE j.kelas_id=? AND (s.materi != '' OR s.catatan_kelas != '')
    ORDER BY s.tanggal DESC, j.jam_mulai ${lim}
  `).all(kelasId) as any[];
}

function dashboard(user: User, ctx: Ctx): Response {
  const a = getAnak(user.id);
  if (!a) return html(page({ title: "Error", ctx, content: alert("Akun belum terhubung data anak. Hubungi admin.", "error") }));
  const sc = statusSummary(a.siswa_id);
  const materi = materiList(a.kelas_id, 3);
  const content = `
    <div class="page-head"><h1>Halo, ${esc(a.ortu_nama.split(" ")[0])} 👋</h1><p>${esc(a.hubungan ?? "Wali")} dari <b>${esc(a.siswa_nama)}</b> (${esc(a.kelas_nama ?? "Belum ada kelas")})</p></div>
    <div class="stat-grid small">
      ${statCard("Hadir", sc.hadir, "✅", "tone-green")}
      ${statCard("Sakit", sc.sakit, "🤒", "tone-yellow")}
      ${statCard("Izin", sc.izin, "📄", "tone-blue")}
      ${statCard("Alpa", sc.alpha, "❌", "tone-red")}
    </div>
    ${card("Materi Terbaru", materi.length ? `
      <div class="materi-list">
        ${materi.map((m) => `
          <div class="materi-item">
            <div class="materi-head"><b>${esc(m.mapel_nama)}</b><span class="muted">${formatDate(m.tanggal)} · ${esc(m.guru_nama)}</span></div>
            <div class="materi-body">${nl2br(m.materi || "-")}</div>
            ${m.catatan_kelas ? `<div class="materi-note">📌 ${nl2br(m.catatan_kelas)}</div>` : ""}
          </div>`).join("")}
      </div>` : emptyState("Belum ada materi."), { action: `<a class="btn btn-ghost btn-sm" href="/orangtua/materi">Lihat Semua</a>` })}
    ${pengumumanCard(visibleFor(user, 8))}`;
  return wrap(ctx, "Dashboard Orang Tua", "/orangtua", content);
}

function kehadiran(user: User, ctx: Ctx): Response {
  const a = getAnak(user.id);
  if (!a) return html(page({ title: "Error", ctx, content: alert("Akun belum terhubung data anak.", "error") }));
  const rows = db.query(`
    SELECT k.status, k.keterangan, s.tanggal, mp.nama AS mapel_nama, j.jam_mulai
    FROM kehadiran k JOIN sesi_mengajar s ON s.id=k.sesi_id
    JOIN jadwal j ON j.id=s.jadwal_id JOIN mata_pelajaran mp ON mp.id=j.mata_pelajaran_id
    WHERE k.siswa_id=? ORDER BY s.tanggal DESC, j.jam_mulai
  `).all(a.siswa_id) as any[];
  const content = `
    <div class="page-head"><h1>Kehadiran ${esc(a.siswa_nama)}</h1></div>
    ${rows.length ? table(
      ["Tanggal", "Jam", "Mapel", "Status", "Keterangan"],
      rows.map((r) => [formatDate(r.tanggal), r.jam_mulai, esc(r.mapel_nama), badge(r.status), esc(r.keterangan ?? "-")]),
    ) : emptyState("Belum ada catatan kehadiran.")}`;
  return wrap(ctx, "Kehadiran", "/orangtua/kehadiran", content);
}

function materi(user: User, ctx: Ctx): Response {
  const a = getAnak(user.id);
  if (!a) return html(page({ title: "Error", ctx, content: alert("Akun belum terhubung data anak.", "error") }));
  const materi = materiList(a.kelas_id);
  const content = `
    <div class="page-head"><h1>Materi Pelajaran</h1></div>
    ${materi.length ? `<div class="materi-list">
      ${materi.map((m) => `
        <div class="materi-item">
          <div class="materi-head"><b>${esc(m.mapel_nama)}</b><span class="muted">${formatDate(m.tanggal)} · ${m.jam_mulai} · ${esc(m.guru_nama)}</span></div>
          <div class="materi-body">${nl2br(m.materi || "-")}</div>
          ${m.catatan_kelas ? `<div class="materi-note">📌 ${nl2br(m.catatan_kelas)}</div>` : ""}
        </div>`).join("")}
    </div>` : emptyState("Belum ada materi.")}`;
  return wrap(ctx, "Materi", "/orangtua/materi", content);
}

export function registerOrtu() {
  add("GET", "/orangtua", (req, ctx) => { const u = requireRole(ctx, "orang_tua"); if (u instanceof Response) return u; return dashboard(u, ctx); });
  add("GET", "/orangtua/kehadiran", (req, ctx) => { const u = requireRole(ctx, "orang_tua"); if (u instanceof Response) return u; return kehadiran(u, ctx); });
  add("GET", "/orangtua/materi", (req, ctx) => { const u = requireRole(ctx, "orang_tua"); if (u instanceof Response) return u; return materi(u, ctx); });
}
