import { add, type Ctx } from "../router";
import { html, redirect, readForm } from "../http";
import { validateCsrf } from "../auth";
import { db } from "../db";
import { esc, nl2br, formatDate, todayStr, dayName, nextOccurrence } from "../util";
import { page, card, table, badge, emptyState, alert, statCard, field, input, select, textarea, button, linkBtn } from "../ui";
import { requireRole } from "../guard";
import type { User } from "../auth";
import { visibleFor, pengumumanCard } from "../announce";
import { run, parseIntSafe, required, maxLength, integer } from "../validate";

function wrap(ctx: Ctx, title: string, active: string, content: string): Response {
  return html(page({ title, ctx, content, active }));
}

function getGuru(userId: number) {
  return db.query("SELECT * FROM guru WHERE user_id=?").get(userId) as
    | { id: number; user_id: number; nip: string | null; nama: string }
    | null;
}

const STATUS_OPTIONS = [
  { value: "hadir", label: "Hadir" },
  { value: "sakit", label: "Sakit" },
  { value: "izin", label: "Izin" },
  { value: "alpha", label: "Alpa" },
];

function sessionItem(j: any, occ: { date: string; isToday: boolean }): string {
  const tag = occ.isToday ? `<span class="pill pill-live">Hari ini</span>` : `<span class="pill">${formatDate(occ.date)}</span>`;
  return `
    <div class="sched-item ${occ.isToday ? "sched-today" : ""}">
      <div class="sched-info">
        <div class="sched-title">${esc(j.mapel_nama)} <span class="muted">· ${esc(j.kelas_nama)}</span></div>
        <div class="sched-meta">${dayName(j.hari)} · ${j.jam_mulai}–${j.jam_selesai} · ${tag}</div>
      </div>
      <a class="btn btn-primary" href="/guru/absen?jadwal=${j.id}&tanggal=${occ.date}">Buka Absensi</a>
    </div>`;
}

function dashboard(user: User, ctx: Ctx): Response {
  const guru = getGuru(user.id);
  if (!guru) return html(page({ title: "Error", ctx, content: alert("Akun guru belum terhubung data guru. Hubungi admin.", "error") }));

  const jadwalRows = db.query(`
    SELECT j.*, k.nama AS kelas_nama, mp.nama AS mapel_nama
    FROM jadwal j JOIN kelas k ON k.id=j.kelas_id JOIN mata_pelajaran mp ON mp.id=j.mata_pelajaran_id
    WHERE j.guru_id=? ORDER BY j.hari, j.jam_mulai
  `).all(guru.id) as any[];

  const todayDow = new Date().getDay();
  const today = jadwalRows.filter((j) => j.hari === todayDow).sort((a, b) => a.jam_mulai.localeCompare(b.jam_mulai));
  const nearest = jadwalRows
    .map((j) => ({ j, occ: nextOccurrence(j.hari, j.jam_mulai) }))
    .sort((a, b) => (a.occ.date === b.occ.date ? a.j.jam_mulai.localeCompare(b.j.jam_mulai) : a.occ.date.localeCompare(b.occ.date)))
    .slice(0, 6);

  const ok = ctx.query.get("ok");
  const err = ctx.query.get("err");

  // Jadwal Hari Ini di posisi atas; jika tidak ada, tampilkan Jadwal Terdekat.
  const scheduleCard = today.length
    ? card("Jadwal Hari Ini", `<div class="sched-list">${today.map((j) => sessionItem(j, { date: todayStr(), isToday: true })).join("")}</div>`)
    : card("Jadwal Mengajar Terdekat", `${nearest.length ? `<div class="sched-list">${nearest.map((n) => sessionItem(n.j, n.occ)).join("")}</div>` : emptyState("Belum ada jadwal mengajar untuk Anda.")}`);

  const nearestOptions = nearest.map((n) => ({
    value: n.j.id,
    label: `${n.j.mapel_nama} · ${n.j.kelas_nama} · ${dayName(n.j.hari)} ${n.j.jam_mulai} (${formatDate(n.occ.date)})`,
  }));

  const pengumuman = `
    ${pengumumanCard(visibleFor(user, 8))}
    ${card("Buat Pengumuman untuk Siswa", `
      <form method="post" action="/guru/pengumuman" class="inline-form">
        ${field("Jadwal Mendatang (target kelas)", select("jadwal_id", nearestOptions.length ? nearestOptions : [{ value: "", label: "Tidak ada jadwal" }]))}
        ${field("Judul", input("judul", "", { required: true, placeholder: "Contoh: Tugas Matematika" }))}
        ${field("Isi Pengumuman", textarea("isi", "", 3, "Tulis pengumuman untuk siswa..."))}
        ${button("📢 Kirim Pengumuman", { tone: "primary" })}
      </form>`)}`;

  const content = `
    ${ok ? alert(esc(ok), "success") : ""}
    ${err ? alert(esc(err), "error") : ""}
    <div class="page-head">
      <h1>Selamat datang, ${esc(guru.nama.split(" ")[0])} 👋</h1>
      <p>Kelola absensi, materi, dan catatan kelas pada jam mengajar Anda.</p>
    </div>
    ${scheduleCard}
    ${pengumuman}`;
  return wrap(ctx, "Dashboard Guru", "/guru", content);
}

function ensureSesi(jadwal: any, tanggal: string, guruId: number) {
  let sesi = db.query("SELECT * FROM sesi_mengajar WHERE jadwal_id=? AND tanggal=?").get(jadwal.id, tanggal) as any;
  if (!sesi) {
    const r = db.run("INSERT INTO sesi_mengajar (jadwal_id, guru_id, tanggal, status) VALUES (?,?,?, 'dibuka')", [jadwal.id, guruId, tanggal]);
    const sesiId = Number(r.lastInsertRowid);
    const siswaRows = db.query("SELECT id FROM siswa WHERE kelas_id=?").all(jadwal.kelas_id) as { id: number }[];
    const ins = db.prepare("INSERT INTO kehadiran (sesi_id, siswa_id, status) VALUES (?,?, 'hadir')");
    for (const s of siswaRows) ins.run(sesiId, s.id);
    sesi = db.query("SELECT * FROM sesi_mengajar WHERE id=?").get(sesiId) as any;
  }
  return sesi;
}

function absenPage(user: User, ctx: Ctx): Response {
  const guru = getGuru(user.id);
  if (!guru) return html(page({ title: "Error", ctx, content: alert("Akun guru belum terhubung data guru.", "error") }));

  const jadwalId = Number(ctx.query.get("jadwal"));
  const tanggal = ctx.query.get("tanggal") ?? todayStr();
  const jadwal = db.query(`
    SELECT j.*, k.nama AS kelas_nama, mp.nama AS mapel_nama
    FROM jadwal j JOIN kelas k ON k.id=j.kelas_id JOIN mata_pelajaran mp ON mp.id=j.mata_pelajaran_id
    WHERE j.id=?
  `).get(jadwalId) as any;
  if (!jadwal || jadwal.guru_id !== guru.id) return redirect("/guru");

  const sesi = ensureSesi(jadwal, tanggal, guru.id);
  const siswaRows = db.query(`
    SELECT s.id, s.nis, s.nama, k.status, k.keterangan
    FROM siswa s LEFT JOIN kehadiran k ON k.siswa_id = s.id AND k.sesi_id = ?
    WHERE s.kelas_id = ? ORDER BY s.nama
  `).all(sesi.id, jadwal.kelas_id) as any[];

  const ok = ctx.query.get("ok");
  const rowsHtml = siswaRows.map((s, i) => {
    const cur = s.status ?? "hadir";
    return `
    <div class="absen-row">
      <div class="absen-siswa">
        <span class="absen-no">${i + 1}</span>
        <div><b>${esc(s.nama)}</b><small>NIS ${esc(s.nis)}</small></div>
      </div>
      <div class="absen-controls">
        <div class="status-btns" data-student="${s.id}">
          ${STATUS_OPTIONS.map((o) => `<button type="button" class="status-btn ${o.value} ${cur === o.value ? "active" : ""}" data-status="${o.value}">${o.label}</button>`).join("")}
          <input type="hidden" name="status_${s.id}" value="${cur}">
        </div>
        <input class="input ket-input" type="text" name="ket_${s.id}" placeholder="Keterangan" value="${esc(s.keterangan ?? "")}">
      </div>
    </div>`;
  }).join("");

  const content = `
    ${ok ? alert(esc(ok), "success") : ""}
    <div class="page-head">
      <h1>Absensi ${esc(jadwal.mapel_nama)}</h1>
      <p>${esc(jadwal.kelas_nama)} · ${formatDate(tanggal)} · ${jadwal.jam_mulai}–${jadwal.jam_selesai} · ${badge(sesi.status)}</p>
    </div>
    <form method="post" action="/guru/absen" class="absen-form">
      <input type="hidden" name="jadwal" value="${jadwal.id}">
      <input type="hidden" name="tanggal" value="${esc(tanggal)}">

      <div class="card">
        <div class="card-head">
          <h2>Daftar Siswa (${siswaRows.length})</h2>
          <div class="quick-btns">
            <button type="button" class="btn btn-sm btn-ghost" data-set-all="hadir">✅ Semua Hadir</button>
            <button type="button" class="btn btn-sm btn-ghost" data-set-all="sakit">🤒 Semua Sakit</button>
            <button type="button" class="btn btn-sm btn-ghost" data-set-all="izin">📄 Semua Izin</button>
            <button type="button" class="btn btn-sm btn-ghost" data-set-all="alpha">❌ Semua Alpa</button>
          </div>
        </div>
        <div class="card-body">
          <p class="muted">Secara default semua siswa berstatus <b>Hadir</b>. Ubah hanya yang perlu.</p>
          ${rowsHtml || emptyState("Tidak ada siswa di kelas ini.")}
        </div>
      </div>

      <div class="grid-2">
        ${card("Materi Pelajaran", `${textarea("materi", sesi.materi, 6, "Tuliskan materi yang diajarkan pada pertemuan ini...")}`)}
        ${card("Catatan Kelas", `${textarea("catatan_kelas", sesi.catatan_kelas, 6, "Catatan tambahan: PR, kejadian kelas, dll...")}`)}
      </div>

      <div class="form-actions sticky-actions">
        ${button("💾 Simpan", { tone: "primary", name: "action", value: "save" })}
        ${button("✅ Simpan & Tandai Selesai", { tone: "success", name: "action", value: "selesai" })}
        ${linkBtn("/guru", "Kembali", "ghost")}
      </div>
    </form>`;
  return wrap(ctx, "Absensi", "/guru", content);
}

function saveAbsen(req: Request, ctx: Ctx): Response {
  return (async () => {
    const guru = getGuru(ctx.user!.id);
    if (!guru) return redirect("/guru");
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const jadwalId = Number(f.get("jadwal"));
    const tanggal = f.get("tanggal") ?? todayStr();
    const jadwal = db.query("SELECT * FROM jadwal WHERE id=?").get(jadwalId) as any;
    if (!jadwal || jadwal.guru_id !== guru.id) return redirect("/guru");

    const sesi = ensureSesi(jadwal, tanggal, guru.id);
    const action = f.get("action") ?? "save";
    if (action !== "save" && action !== "selesai") return redirect("/guru");
    const status = action === "selesai" ? "selesai" : "dibuka";
    const materi = (f.get("materi") ?? "").trim();
    const catatan = (f.get("catatan_kelas") ?? "").trim();
    const err = run(materi, [maxLength(2000, "Materi")]) || run(catatan, [maxLength(2000, "Catatan kelas")]);
    if (err) return redirect(`/guru/absen?jadwal=${jadwalId}&tanggal=${tanggal}&err=${encodeURIComponent(err)}`);
    db.run("UPDATE sesi_mengajar SET materi=?, catatan_kelas=?, status=?, updated_at=datetime('now') WHERE id=?", [
      materi, catatan, status, sesi.id,
    ]);

    const siswaRows = db.query("SELECT id FROM siswa WHERE kelas_id=?").all(jadwal.kelas_id) as { id: number }[];
    const upsert = db.prepare(`
      INSERT INTO kehadiran (sesi_id, siswa_id, status, keterangan, updated_at)
      VALUES (?,?,?,?, datetime('now'))
      ON CONFLICT(sesi_id, siswa_id) DO UPDATE SET status=excluded.status, keterangan=excluded.keterangan, updated_at=datetime('now')
    `);
    const validStatus = ["hadir", "sakit", "izin", "alpha"];
    for (const s of siswaRows) {
      const stRaw = f.get(`status_${s.id}`) ?? "hadir";
      const st = validStatus.includes(String(stRaw)) ? String(stRaw) : "hadir";
      const ket = (f.get(`ket_${s.id}`) ?? "").trim();
      const ketErr = run(ket, [maxLength(200, "Keterangan")]);
      if (ketErr) return redirect(`/guru/absen?jadwal=${jadwalId}&tanggal=${tanggal}&err=${encodeURIComponent(ketErr)}`);
      upsert.run(sesi.id, s.id, st, ket);
    }
    const msg = action === "selesai" ? "Absensi disimpan & sesi ditandai selesai." : "Absensi berhasil disimpan.";
    return redirect(`/guru/absen?jadwal=${jadwalId}&tanggal=${tanggal}&ok=${encodeURIComponent(msg)}`);
  })();
}

function riwayat(user: User, ctx: Ctx): Response {
  const guru = getGuru(user.id);
  if (!guru) return html(page({ title: "Error", ctx, content: alert("Akun guru belum terhubung data guru.", "error") }));
  const rows = db.query(`
    SELECT s.*, j.jam_mulai, j.jam_selesai, k.nama AS kelas_nama, mp.nama AS mapel_nama,
      (SELECT COUNT(*) FROM kehadiran x WHERE x.sesi_id=s.id AND x.status='hadir') hadir,
      (SELECT COUNT(*) FROM kehadiran x WHERE x.sesi_id=s.id AND x.status='sakit') sakit,
      (SELECT COUNT(*) FROM kehadiran x WHERE x.sesi_id=s.id AND x.status='izin') izin,
      (SELECT COUNT(*) FROM kehadiran x WHERE x.sesi_id=s.id AND x.status='alpha') alpha
    FROM sesi_mengajar s
    JOIN jadwal j ON j.id=s.jadwal_id
    JOIN kelas k ON k.id=j.kelas_id
    JOIN mata_pelajaran mp ON mp.id=j.mata_pelajaran_id
    WHERE s.guru_id=? ORDER BY s.tanggal DESC, j.jam_mulai DESC
  `).all(guru.id) as any[];

  const content = `
    <div class="page-head"><h1>Riwayat Mengajar</h1><p>Daftar sesi absensi yang pernah Anda kelola.</p></div>
    ${rows.length ? table(
      ["Tanggal", "Jam", "Kelas", "Mapel", "Hadir", "Sakit", "Izin", "Alpa", "Status", "Aksi"],
      rows.map((r) => [
        formatDate(r.tanggal), `${r.jam_mulai}–${r.jam_selesai}`, esc(r.kelas_nama), esc(r.mapel_nama),
        String(r.hadir), String(r.sakit), String(r.izin), String(r.alpha),
        badge(r.status),
        linkBtn(`/guru/absen?jadwal=${r.jadwal_id}&tanggal=${r.tanggal}`, "Buka", "ghost"),
      ]),
    ) : emptyState("Belum ada sesi mengajar yang direkam.")}`;
  return wrap(ctx, "Riwayat", "/guru/riwayat", content);
}

function createPengumumanGuru(req: Request, ctx: Ctx): Response {
  return (async () => {
    const guru = getGuru(ctx.user!.id);
    if (!guru) return redirect("/guru");
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const judul = (f.get("judul") ?? "").trim();
    const isi = (f.get("isi") ?? "").trim();
    const jadwalId = parseIntSafe(f.get("jadwal_id"));
    const err = run(judul, [required("Judul"), maxLength(200, "Judul")]) || run(isi, [required("Isi pengumuman"), maxLength(2000, "Isi pengumuman")]) || (jadwalId ? null : "Jadwal wajib dipilih.");
    if (err) return redirect("/guru?err=" + encodeURIComponent(err));
    const jadwal = db.query("SELECT * FROM jadwal WHERE id=?").get(jadwalId) as any;
    if (!jadwal || jadwal.guru_id !== guru.id) return redirect("/guru?err=" + encodeURIComponent("Jadwal tidak valid."));
    db.run("INSERT INTO pengumuman (judul, isi, author_id, author_nama, author_role, target, kelas_id, jadwal_id) VALUES (?,?,?,?,?,'kelas',?,?)", [
      judul, isi, ctx.user!.id, guru.nama, "guru", jadwal.kelas_id, jadwalId,
    ]);
    return redirect("/guru?ok=" + encodeURIComponent("Pengumuman berhasil dikirim ke siswa."));
  })();
}

export function registerGuru() {
  add("GET", "/guru", (req, ctx) => { const u = requireRole(ctx, "guru"); if (u instanceof Response) return u; return dashboard(u, ctx); });
  add("GET", "/guru/absen", (req, ctx) => { const u = requireRole(ctx, "guru"); if (u instanceof Response) return u; return absenPage(u, ctx); });
  add("POST", "/guru/absen", (req, ctx) => { const u = requireRole(ctx, "guru"); if (u instanceof Response) return u; return saveAbsen(req, ctx); });
  add("GET", "/guru/riwayat", (req, ctx) => { const u = requireRole(ctx, "guru"); if (u instanceof Response) return u; return riwayat(u, ctx); });
  add("POST", "/guru/pengumuman", (req, ctx) => { const u = requireRole(ctx, "guru"); if (u instanceof Response) return u; return createPengumumanGuru(req, ctx); });
}
