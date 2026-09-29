import { add, type Ctx } from "../router";
import { html } from "../http";
import { db } from "../db";
import { esc, formatDate, todayStr, dayName } from "../util";
import { page, card, table, badge, emptyState, statCard, field, input, select, button, alert } from "../ui";
import { requireRole } from "../guard";
import type { User } from "../auth";
import { visibleFor, pengumumanCard } from "../announce";

function wrap(ctx: Ctx, title: string, active: string, content: string): Response {
  return html(page({ title, ctx, content, active }));
}

function dashboard(user: User, ctx: Ctx): Response {
  const t = todayStr();
  const cnt = (sql: string, p: unknown[] = []) => (db.query(sql).get(...p) as { c: number }).c;
  const totalKelas = cnt("SELECT COUNT(*) c FROM kelas");
  const totalSiswa = cnt("SELECT COUNT(*) c FROM siswa");
  const totalGuru = cnt("SELECT COUNT(*) c FROM guru");
  const totalJadwal = cnt("SELECT COUNT(*) c FROM jadwal");
  const sesiHariIni = cnt("SELECT COUNT(*) c FROM sesi_mengajar WHERE tanggal=?", [t]);
  const statusRows = db.query("SELECT k.status, COUNT(*) c FROM kehadiran k JOIN sesi_mengajar s ON s.id=k.sesi_id WHERE s.tanggal=? GROUP BY k.status").all(t) as { status: string; c: number }[];
  const sc: Record<string, number> = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
  for (const r of statusRows) sc[r.status] = r.c;

  const content = `
    <div class="page-head"><h1>Dashboard Monitoring</h1><p>${formatDate(t)} · Mode lihat saja</p></div>
    <div class="stat-grid">
      ${statCard("Siswa", totalSiswa, "🎓")}
      ${statCard("Guru", totalGuru, "👨‍🏫")}
      ${statCard("Kelas", totalKelas, "🏫")}
      ${statCard("Jadwal", totalJadwal, "🗓️")}
    </div>
    ${card("Kehadiran Hari Ini", `
      <div class="stat-grid small">
        ${statCard("Sesi", sesiHariIni, "📝")}
        ${statCard("Hadir", sc.hadir, "✅", "tone-green")}
        ${statCard("Sakit", sc.sakit, "🤒", "tone-yellow")}
        ${statCard("Izin", sc.izin, "📄", "tone-blue")}
        ${statCard("Alpa", sc.alpha, "❌", "tone-red")}
      </div>`)}
    <div class="grid-2">
      ${card("Menu Monitoring", `
        <div class="quick-actions">
          <a class="btn" href="/kepala/jadwal">🗓️ Lihat Jadwal</a>
          <a class="btn" href="/kepala/rekap">📊 Rekap Kehadiran</a>
          <a class="btn" href="/kepala/data">📁 Data Sekolah</a>
        </div>`)}
    </div>
    ${pengumumanCard(visibleFor(user, 8))}`;
  return wrap(ctx, "Monitoring", "/kepala", content);
}

function jadwal(user: User, ctx: Ctx): Response {
  const kelasId = ctx.query.get("kelas_id") ?? "";
  const guruId = ctx.query.get("guru_id") ?? "";
  const kelasRows = db.query("SELECT id, nama FROM kelas ORDER BY nama").all() as { id: number; nama: string }[];
  const guruRows = db.query("SELECT id, nama FROM guru ORDER BY nama").all() as { id: number; nama: string }[];
  const rows = db.query(`
    SELECT j.*, k.nama AS kelas_nama, mp.nama AS mapel_nama, g.nama AS guru_nama
    FROM jadwal j JOIN kelas k ON k.id=j.kelas_id
    JOIN mata_pelajaran mp ON mp.id=j.mata_pelajaran_id
    JOIN guru g ON g.id=j.guru_id
    WHERE (?='' OR k.id=?) AND (?='' OR g.id=?)
    ORDER BY j.hari, j.jam_mulai, k.nama
  `).all(kelasId, kelasId, guruId, guruId) as any[];

  const content = `
    <div class="page-head"><h1>Jadwal Pelajaran</h1></div>
    ${card("Filter", `
      <form method="get" action="/kepala/jadwal" class="inline-form">
        ${field("Kelas", select("kelas_id", [{ value: "", label: "Semua Kelas" }, ...kelasRows.map((r) => ({ value: r.id, label: r.nama }))], kelasId))}
        ${field("Guru", select("guru_id", [{ value: "", label: "Semua Guru" }, ...guruRows.map((r) => ({ value: r.id, label: r.nama }))], guruId))}
        ${button("Tampilkan", { tone: "primary" })}
      </form>`)}
    ${rows.length ? table(["Hari", "Jam", "Kelas", "Mapel", "Guru"], rows.map((r) => [
      dayName(r.hari), `${r.jam_mulai}–${r.jam_selesai}`, esc(r.kelas_nama), esc(r.mapel_nama), esc(r.guru_nama),
    ])) : emptyState("Tidak ada jadwal.")}`;
  return wrap(ctx, "Jadwal", "/kepala/jadwal", content);
}

function rekap(user: User, ctx: Ctx): Response {
  const kelasId = ctx.query.get("kelas_id") ?? "";
  const tanggal = ctx.query.get("tanggal") ?? todayStr();
  const kelasRows = db.query("SELECT id, nama FROM kelas ORDER BY nama").all() as { id: number; nama: string }[];

  const sesiRows = db.query(`
    SELECT s.id, s.status, j.jam_mulai, j.jam_selesai, k.nama AS kelas_nama, mp.nama AS mapel_nama, g.nama AS guru_nama
    FROM sesi_mengajar s
    JOIN jadwal j ON j.id = s.jadwal_id
    JOIN kelas k ON k.id = j.kelas_id
    JOIN mata_pelajaran mp ON mp.id = j.mata_pelajaran_id
    JOIN guru g ON g.id = j.guru_id
    WHERE s.tanggal = ? ${kelasId ? "AND k.id = ?" : ""}
    ORDER BY j.jam_mulai
  `).all(kelasId ? [tanggal, kelasId] : [tanggal]) as any[];

  const statusCounts = db.query(`
    SELECT k.status, COUNT(*) c FROM kehadiran k JOIN sesi_mengajar s ON s.id=k.sesi_id JOIN jadwal j ON j.id=s.jadwal_id
    WHERE s.tanggal=? ${kelasId ? "AND j.kelas_id=?" : ""} GROUP BY k.status
  `).all(kelasId ? [tanggal, kelasId] : [tanggal]) as { status: string; c: number }[];
  const sc: Record<string, number> = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
  for (const r of statusCounts) sc[r.status] = r.c;

  const detailRows = db.query(`
    SELECT k.status, k.keterangan, sw.nama AS siswa_nama, sw.nis, mp.nama AS mapel_nama, j.jam_mulai
    FROM kehadiran k JOIN sesi_mengajar s ON s.id=k.sesi_id JOIN jadwal j ON j.id=s.jadwal_id
    JOIN mata_pelajaran mp ON mp.id=j.mata_pelajaran_id JOIN siswa sw ON sw.id=k.siswa_id
    WHERE s.tanggal=? ${kelasId ? "AND j.kelas_id=?" : ""} ORDER BY j.jam_mulai, sw.nama
  `).all(kelasId ? [tanggal, kelasId] : [tanggal]) as any[];

  const content = `
    <div class="page-head"><h1>Rekap Kehadiran</h1></div>
    ${card("Filter", `
      <form method="get" action="/kepala/rekap" class="inline-form">
        ${field("Kelas", select("kelas_id", [{ value: "", label: "Semua Kelas" }, ...kelasRows.map((r) => ({ value: r.id, label: r.nama }))], kelasId))}
        ${field("Tanggal", input("tanggal", tanggal, { type: "date", required: true }))}
        ${button("Tampilkan", { tone: "primary" })}
      </form>`)}
    <div class="stat-grid small">
      ${statCard("Hadir", sc.hadir, "✅", "tone-green")}
      ${statCard("Sakit", sc.sakit, "🤒", "tone-yellow")}
      ${statCard("Izin", sc.izin, "📄", "tone-blue")}
      ${statCard("Alpa", sc.alpha, "❌", "tone-red")}
    </div>
    ${sesiRows.length ? card("Sesi Mengajar", table(["Jam", "Kelas", "Mapel", "Guru", "Status"], sesiRows.map((s) => [`${s.jam_mulai}–${s.jam_selesai}`, esc(s.kelas_nama), esc(s.mapel_nama), esc(s.guru_nama), badge(s.status)]))) : emptyState("Belum ada sesi pada tanggal ini.")}
    ${detailRows.length ? card("Detail Kehadiran", table(["Jam", "Mapel", "NIS", "Nama Siswa", "Status", "Keterangan"], detailRows.map((r) => [r.jam_mulai, esc(r.mapel_nama), esc(r.nis), esc(r.siswa_nama), badge(r.status), esc(r.keterangan ?? "-")]))) : ""}`;
  return wrap(ctx, "Rekap", "/kepala/rekap", content);
}

function data(user: User, ctx: Ctx): Response {
  const kelasRows = db.query("SELECT k.*, (SELECT COUNT(*) FROM siswa s WHERE s.kelas_id=k.id) jumlah FROM kelas k ORDER BY k.nama").all() as any[];
  const guruRows = db.query("SELECT g.nama, g.nip, u.username FROM guru g JOIN users u ON u.id=g.user_id ORDER BY g.nama").all() as any[];
  const siswaRows = db.query("SELECT s.nis, s.nama, k.nama AS kelas_nama FROM siswa s LEFT JOIN kelas k ON k.id=s.kelas_id ORDER BY s.nama").all() as any[];

  const content = `
    <div class="page-head"><h1>Data Sekolah</h1></div>
    ${card("Kelas", kelasRows.length ? table(["Nama", "Tingkat", "Wali Kelas", "Jumlah Siswa"], kelasRows.map((r) => [esc(r.nama), esc(r.tingkat ?? "-"), esc(r.wali_kelas ?? "-"), String(r.jumlah)])) : emptyState("Belum ada kelas."))}
    ${card("Guru", guruRows.length ? table(["Nama", "NIP", "Username"], guruRows.map((r) => [esc(r.nama), esc(r.nip ?? "-"), esc(r.username)])) : emptyState("Belum ada guru."))}
    ${card("Siswa", siswaRows.length ? table(["NIS", "Nama", "Kelas"], siswaRows.map((r) => [esc(r.nis), esc(r.nama), esc(r.kelas_nama ?? "-")])) : emptyState("Belum ada siswa."))}`;
  return wrap(ctx, "Data", "/kepala/data", content);
}

export function registerKepala() {
  add("GET", "/kepala", (req, ctx) => { const u = requireRole(ctx, "kepala_sekolah"); if (u instanceof Response) return u; return dashboard(u, ctx); });
  add("GET", "/kepala/jadwal", (req, ctx) => { const u = requireRole(ctx, "kepala_sekolah"); if (u instanceof Response) return u; return jadwal(u, ctx); });
  add("GET", "/kepala/rekap", (req, ctx) => { const u = requireRole(ctx, "kepala_sekolah"); if (u instanceof Response) return u; return rekap(u, ctx); });
  add("GET", "/kepala/data", (req, ctx) => { const u = requireRole(ctx, "kepala_sekolah"); if (u instanceof Response) return u; return data(u, ctx); });
}
