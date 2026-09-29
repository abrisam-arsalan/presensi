import { add, type Ctx } from "../router";
import { html, redirect, readForm } from "../http";
import { db, ensureKehadiranForSiswa } from "../db";
import { esc, formatDate, todayStr, dayName, roleLabel } from "../util";
import {
  page, card, table, badge, emptyState, alert, statCard,
  field, input, select, textarea, button, linkBtn,
} from "../ui";
import { requireRole } from "../guard";
import { hashPassword, validateCsrf } from "../auth";
import type { User } from "../auth";
import { visibleFor, pengumumanCard } from "../announce";
import { run, parseIntSafe, nama, username, password, required, minLength, maxLength, pattern, integer, time, timeRange, hariValid } from "../validate";

function wrap(ctx: Ctx, title: string, active: string, content: string): Response {
  return html(page({ title, ctx, content, active }));
}

function okAlert(ctx: Ctx): string {
  const ok = ctx.query.get("ok");
  const err = ctx.query.get("err");
  if (err) return alert(esc(err), "error");
  if (ok) return alert(esc(ok), "success");
  return "";
}

// ---------- Opsi dropdown ----------
function kelasOptions(selected?: number | string) {
  const rows = db.query("SELECT id, nama FROM kelas ORDER BY nama").all() as { id: number; nama: string }[];
  return rows.map((r) => ({ value: r.id, label: r.nama }));
}
function mapelOptions(selected?: number | string) {
  const rows = db.query("SELECT id, nama FROM mata_pelajaran ORDER BY nama").all() as { id: number; nama: string }[];
  return rows.map((r) => ({ value: r.id, label: r.nama }));
}
function guruOptions(selected?: number | string) {
  const rows = db.query("SELECT id, nama FROM guru ORDER BY nama").all() as { id: number; nama: string }[];
  return rows.map((r) => ({ value: r.id, label: r.nama }));
}
function siswaOptions(selected?: number | string) {
  const rows = db.query("SELECT s.id, s.nama, k.nama AS kelas FROM siswa s LEFT JOIN kelas k ON k.id=s.kelas_id ORDER BY s.nama").all() as { id: number; nama: string; kelas: string }[];
  return rows.map((r) => ({ value: r.id, label: `${r.nama}${r.kelas ? ` (${r.kelas})` : ""}` }));
}

async function createUserHashed(username: string, password: string, nama: string, role: string): Promise<number> {
  const r = db.run("INSERT INTO users (username, password_hash, nama, role) VALUES (?,?,?,?)", [
    username, await hashPassword(password), nama, role,
  ]);
  return Number(r.lastInsertRowid);
}

// ---------- Dashboard ----------
function dashboard(user: User, ctx: Ctx): Response {
  const t = todayStr();
  const cnt = (sql: string, p: unknown[] = []) => (db.query(sql).get(...p) as { c: number }).c;
  const totalKelas = cnt("SELECT COUNT(*) c FROM kelas");
  const totalSiswa = cnt("SELECT COUNT(*) c FROM siswa");
  const totalGuru = cnt("SELECT COUNT(*) c FROM guru");
  const totalMapel = cnt("SELECT COUNT(*) c FROM mata_pelajaran");
  const totalJadwal = cnt("SELECT COUNT(*) c FROM jadwal");

  const sesiHariIni = cnt("SELECT COUNT(*) c FROM sesi_mengajar WHERE tanggal = ?", [t]);
  const statusRows = db.query(
    "SELECT k.status, COUNT(*) c FROM kehadiran k JOIN sesi_mengajar s ON s.id=k.sesi_id WHERE s.tanggal=? GROUP BY k.status",
  ).all(t) as { status: string; c: number }[];
  const statusCount: Record<string, number> = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
  for (const r of statusRows) statusCount[r.status] = r.c;
  const totalKehadiran = statusRows.reduce((a, b) => a + b.c, 0);

  const content = `
    ${okAlert(ctx)}
    <div class="page-head"><h1>Dashboard Admin</h1><p>${formatDate(t)}</p></div>
    <div class="stat-grid">
      ${statCard("Siswa", totalSiswa, "🎓")}
      ${statCard("Guru", totalGuru, "👨‍🏫")}
      ${statCard("Kelas", totalKelas, "🏫")}
      ${statCard("Mata Pelajaran", totalMapel, "📚")}
      ${statCard("Jadwal", totalJadwal, "🗓️")}
    </div>
    <div class="grid-2">
      ${card("Kehadiran Hari Ini", `
        <div class="stat-grid small">
          ${statCard("Sesi dibuka", sesiHariIni, "📝")}
          ${statCard("Hadir", statusCount.hadir, "✅", "tone-green")}
          ${statCard("Sakit", statusCount.sakit, "🤒", "tone-yellow")}
          ${statCard("Izin", statusCount.izin, "📄", "tone-blue")}
          ${statCard("Alpa", statusCount.alpha, "❌", "tone-red")}
        </div>
        <p class="muted">Total catatan kehadiran hari ini: ${totalKehadiran}</p>`, { action: linkBtn("/admin/rekap", "Buka Rekap", "primary") })}
      ${card("Aksi Cepat", `
        <div class="quick-actions">
          ${linkBtn("/admin/jadwal", "➕ Atur Jadwal")}
          ${linkBtn("/admin/siswa", "🎓 Data Siswa")}
          ${linkBtn("/admin/kelas", "🏫 Data Kelas")}
          ${linkBtn("/admin/user", "👤 Data User")}
          ${linkBtn("/admin/guru", "👨‍🏫 Data Guru")}
          ${linkBtn("/admin/ortu", "👨‍👩‍👧 Data Orang Tua")}
        </div>`)}
    </div>
    ${pengumumanCard(visibleFor(user, 8))}
    ${card("Buat Pengumuman (Seluruh User)", `
      <form method="post" action="/admin/pengumuman" class="inline-form">
        ${field("Judul", input("judul", "", { required: true, placeholder: "Contoh: Libur Hari Raya" }))}
        ${field("Isi Pengumuman", textarea("isi", "", 3, "Tulis pengumuman untuk seluruh user..."))}
        ${button("📢 Kirim ke Semua User", { tone: "primary" })}
      </form>`)}`;
  return wrap(ctx, "Dashboard", "/admin", content);
}

function createPengumumanAdmin(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const judul = (f.get("judul") ?? "").trim();
    const isi = (f.get("isi") ?? "").trim();
    const err = run(judul, [required("Judul"), maxLength(200, "Judul")]) || run(isi, [required("Isi pengumuman"), maxLength(2000, "Isi pengumuman")]);
    if (err) return redirect("/admin?err=" + encodeURIComponent(err));
    db.run("INSERT INTO pengumuman (judul, isi, author_id, author_nama, author_role, target) VALUES (?,?,?,?,?,'semua')", [
      judul, isi, ctx.user!.id, ctx.user!.nama, "admin",
    ]);
    return redirect("/admin?ok=" + encodeURIComponent("Pengumuman dikirim ke seluruh user."));
  })();
}

// ---------- Kelas ----------
function listKelas(user: User, ctx: Ctx): Response {
  const rows = db.query("SELECT k.*, (SELECT COUNT(*) FROM siswa s WHERE s.kelas_id=k.id) AS jumlah FROM kelas k ORDER BY k.nama").all() as any[];
  const content = `
    ${okAlert(ctx)}
    <div class="page-head"><h1>Data Kelas</h1></div>
    ${card("Tambah Kelas", `
      <form method="post" action="/admin/kelas" class="inline-form">
        ${field("Nama Kelas", input("nama", "", { required: true, placeholder: "XII IPA 1" }))}
        ${field("Tingkat", input("tingkat", "", { placeholder: "XII" }))}
        ${field("Wali Kelas", input("wali_kelas", "", { placeholder: "Nama wali kelas" }))}
        ${button("Tambah", { tone: "primary" })}
      </form>`)}
    ${rows.length ? table(
      ["Nama", "Tingkat", "Wali Kelas", "Jumlah Siswa", "Aksi"],
      rows.map((r) => [
        `<b>${esc(r.nama)}</b>`,
        esc(r.tingkat ?? "-"),
        esc(r.wali_kelas ?? "-"),
        String(r.jumlah),
        `<div class="row-actions">
          ${linkBtn(`/admin/kelas/${r.id}/edit`, "Edit", "ghost")}
          <form method="post" action="/admin/kelas/${r.id}/delete" class="inline">${button("Hapus", { tone: "danger", confirm: `Hapus kelas ${r.nama}?` })}</form>
        </div>`,
      ]),
    ) : emptyState("Belum ada kelas.")}`;
  return wrap(ctx, "Kelas", "/admin/kelas", content);
}

function createKelas(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const namaVal = (f.get("nama") ?? "").trim();
    const err = run(namaVal, [required("Nama kelas"), minLength(2, "Nama kelas"), maxLength(50, "Nama kelas")]);
    if (err) return redirect("/admin/kelas?err=" + encodeURIComponent(err));
    db.run("INSERT INTO kelas (nama, tingkat, wali_kelas) VALUES (?,?,?)", [
      namaVal, (f.get("tingkat") ?? "").trim() || null, (f.get("wali_kelas") ?? "").trim() || null,
    ]);
    return redirect("/admin/kelas?ok=Kelas berhasil ditambahkan");
  })();
}

function editKelas(user: User, ctx: Ctx): Response {
  const r = db.query("SELECT * FROM kelas WHERE id=?").get(ctx.params.id) as any;
  if (!r) return redirect("/admin/kelas?err=Kelas tidak ditemukan");
  const content = `
    <div class="page-head"><h1>Edit Kelas</h1></div>
    ${card("Form Edit", `
      <form method="post" action="/admin/kelas/${r.id}/update">
        ${field("Nama Kelas", input("nama", r.nama, { required: true }))}
        ${field("Tingkat", input("tingkat", r.tingkat ?? ""))}
        ${field("Wali Kelas", input("wali_kelas", r.wali_kelas ?? ""))}
        <div class="form-actions">${button("Simpan", { tone: "primary" })} ${linkBtn("/admin/kelas", "Batal", "ghost")}</div>
      </form>`)}`;
  return wrap(ctx, "Edit Kelas", "/admin/kelas", content);
}

function updateKelas(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const namaVal = (f.get("nama") ?? "").trim();
    const err = run(namaVal, [required("Nama kelas"), minLength(2, "Nama kelas"), maxLength(50, "Nama kelas")]);
    if (err) return redirect("/admin/kelas?err=" + encodeURIComponent(err));
    db.run("UPDATE kelas SET nama=?, tingkat=?, wali_kelas=? WHERE id=?", [
      namaVal, (f.get("tingkat") ?? "").trim() || null, (f.get("wali_kelas") ?? "").trim() || null, ctx.params.id,
    ]);
    return redirect("/admin/kelas?ok=Kelas berhasil diperbarui");
  })();
}

function deleteKelas(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    db.run("DELETE FROM kelas WHERE id=?", [ctx.params.id]);
    return redirect("/admin/kelas?ok=Kelas dihapus");
  })();
}

// ---------- Mata Pelajaran ----------
function listMapel(user: User, ctx: Ctx): Response {
  const rows = db.query("SELECT * FROM mata_pelajaran ORDER BY nama").all() as any[];
  const content = `
    ${okAlert(ctx)}
    <div class="page-head"><h1>Mata Pelajaran</h1></div>
    ${card("Tambah Mapel", `
      <form method="post" action="/admin/mapel" class="inline-form">
        ${field("Nama", input("nama", "", { required: true, placeholder: "Matematika" }))}
        ${field("Kode", input("kode", "", { placeholder: "MTK" }))}
        ${button("Tambah", { tone: "primary" })}
      </form>`)}
    ${rows.length ? table(["Nama", "Kode", "Aksi"], rows.map((r) => [
      `<b>${esc(r.nama)}</b>`, esc(r.kode ?? "-"),
      `<div class="row-actions">
        ${linkBtn(`/admin/mapel/${r.id}/edit`, "Edit", "ghost")}
        <form method="post" action="/admin/mapel/${r.id}/delete" class="inline">${button("Hapus", { tone: "danger", confirm: `Hapus ${r.nama}?` })}</form>
      </div>`,
    ])) : emptyState("Belum ada mata pelajaran.")}`;
  return wrap(ctx, "Mapel", "/admin/mapel", content);
}

function createMapel(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const namaVal = (f.get("nama") ?? "").trim();
    const err = run(namaVal, [required("Nama mapel"), minLength(2, "Nama mapel"), maxLength(100, "Nama mapel")]);
    if (err) return redirect("/admin/mapel?err=" + encodeURIComponent(err));
    db.run("INSERT INTO mata_pelajaran (nama, kode) VALUES (?,?)", [namaVal, (f.get("kode") ?? "").trim() || null]);
    return redirect("/admin/mapel?ok=Mapel ditambahkan");
  })();
}

function editMapel(user: User, ctx: Ctx): Response {
  const r = db.query("SELECT * FROM mata_pelajaran WHERE id=?").get(ctx.params.id) as any;
  if (!r) return redirect("/admin/mapel?err=Mapel tidak ditemukan");
  const content = `
    <div class="page-head"><h1>Edit Mapel</h1></div>
    ${card("Form Edit", `
      <form method="post" action="/admin/mapel/${r.id}/update">
        ${field("Nama", input("nama", r.nama, { required: true }))}
        ${field("Kode", input("kode", r.kode ?? ""))}
        <div class="form-actions">${button("Simpan", { tone: "primary" })} ${linkBtn("/admin/mapel", "Batal", "ghost")}</div>
      </form>`)}`;
  return wrap(ctx, "Edit Mapel", "/admin/mapel", content);
}

function updateMapel(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const namaVal = (f.get("nama") ?? "").trim();
    const err = run(namaVal, [required("Nama mapel"), minLength(2, "Nama mapel"), maxLength(100, "Nama mapel")]);
    if (err) return redirect("/admin/mapel?err=" + encodeURIComponent(err));
    db.run("UPDATE mata_pelajaran SET nama=?, kode=? WHERE id=?", [namaVal, (f.get("kode") ?? "").trim() || null, ctx.params.id]);
    return redirect("/admin/mapel?ok=Mapel diperbarui");
  })();
}

function deleteMapel(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    db.run("DELETE FROM mata_pelajaran WHERE id=?", [ctx.params.id]);
    return redirect("/admin/mapel?ok=Mapel dihapus");
  })();
}

// ---------- Guru ----------
function listGuru(user: User, ctx: Ctx): Response {
  const rows = db.query("SELECT g.*, u.username FROM guru g JOIN users u ON u.id=g.user_id ORDER BY g.nama").all() as any[];
  const content = `
    ${okAlert(ctx)}
    <div class="page-head"><h1>Data Guru</h1></div>
    ${card("Tambah Guru", `
      <form method="post" action="/admin/guru" class="inline-form">
        ${field("Nama Lengkap", input("nama", "", { required: true }))}
        ${field("NIP", input("nip", ""))}
        ${field("Username", input("username", "", { required: true }))}
        ${field("Password", input("password", "", { type: "password", required: true }))}
        ${button("Tambah", { tone: "primary" })}
      </form>`)}
    ${rows.length ? table(["Nama", "NIP", "Username", "Aksi"], rows.map((r) => [
      `<b>${esc(r.nama)}</b>`, esc(r.nip ?? "-"), esc(r.username),
      `<div class="row-actions">
        ${linkBtn(`/admin/guru/${r.id}/edit`, "Edit", "ghost")}
        <form method="post" action="/admin/guru/${r.id}/delete" class="inline">${button("Hapus", { tone: "danger", confirm: `Hapus guru ${r.nama}?` })}</form>
      </div>`,
    ])) : emptyState("Belum ada guru.")}`;
  return wrap(ctx, "Guru", "/admin/guru", content);
}

function createGuru(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const namaVal = (f.get("nama") ?? "").trim();
    const usernameVal = (f.get("username") ?? "").trim();
    const passwordVal = f.get("password") ?? "";
    const err = run(namaVal, nama()) || run(usernameVal, username()) || run(passwordVal, password()) || run((f.get("nip") ?? "").trim(), [maxLength(30, "NIP")]);
    if (err) return redirect("/admin/guru?err=" + encodeURIComponent(err));
    try {
      const uid = await createUserHashed(usernameVal, passwordVal, namaVal, "guru");
      db.run("INSERT INTO guru (user_id, nip, nama) VALUES (?,?,?)", [uid, (f.get("nip") ?? "").trim() || null, namaVal]);
      return redirect("/admin/guru?ok=Guru ditambahkan");
    } catch (e: any) {
      return redirect("/admin/guru?err=" + encodeURIComponent("Username sudah dipakai atau data tidak valid."));
    }
  })();
}

function editGuru(user: User, ctx: Ctx): Response {
  const r = db.query("SELECT g.*, u.username FROM guru g JOIN users u ON u.id=g.user_id WHERE g.id=?").get(ctx.params.id) as any;
  if (!r) return redirect("/admin/guru?err=Guru tidak ditemukan");
  const content = `
    <div class="page-head"><h1>Edit Guru</h1></div>
    ${card("Form Edit", `
      <form method="post" action="/admin/guru/${r.id}/update">
        ${field("Nama Lengkap", input("nama", r.nama, { required: true }))}
        ${field("NIP", input("nip", r.nip ?? ""))}
        ${field("Username", input("username", r.username, { required: true }))}
        ${field("Password Baru (kosongkan jika tetap)", input("password", "", { type: "password" }))}
        <div class="form-actions">${button("Simpan", { tone: "primary" })} ${linkBtn("/admin/guru", "Batal", "ghost")}</div>
      </form>`)}`;
  return wrap(ctx, "Edit Guru", "/admin/guru", content);
}

function updateGuru(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const namaVal = (f.get("nama") ?? "").trim();
    const usernameVal = (f.get("username") ?? "").trim();
    const passwordVal = f.get("password") ?? "";
    const err = run(namaVal, nama()) || run(usernameVal, username()) || run((f.get("nip") ?? "").trim(), [maxLength(30, "NIP")]);
    if (err) return redirect("/admin/guru?err=" + encodeURIComponent(err));
    if (passwordVal) {
      const pwErr = run(passwordVal, password());
      if (pwErr) return redirect("/admin/guru?err=" + encodeURIComponent(pwErr));
    }
    try {
      const g = db.query("SELECT user_id FROM guru WHERE id=?").get(ctx.params.id) as any;
      db.run("UPDATE users SET username=?, nama=? WHERE id=?", [usernameVal, namaVal, g.user_id]);
      if (passwordVal) {
        db.run("UPDATE users SET password_hash=? WHERE id=?", [await hashPassword(passwordVal), g.user_id]);
      }
      db.run("UPDATE guru SET nip=?, nama=? WHERE id=?", [(f.get("nip") ?? "").trim() || null, namaVal, ctx.params.id]);
      return redirect("/admin/guru?ok=Guru diperbarui");
    } catch (e: any) {
      return redirect("/admin/guru?err=" + encodeURIComponent("Username sudah dipakai."));
    }
  })();
}

function deleteGuru(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const g = db.query("SELECT user_id FROM guru WHERE id=?").get(ctx.params.id) as any;
    if (g) db.run("DELETE FROM users WHERE id=?", [g.user_id]);
    return redirect("/admin/guru?ok=Guru dihapus");
  })();
}

// ---------- Siswa ----------
function listSiswa(user: User, ctx: Ctx): Response {
  const rows = db.query("SELECT s.*, k.nama AS kelas_nama, u.username FROM siswa s LEFT JOIN kelas k ON k.id=s.kelas_id LEFT JOIN users u ON u.id=s.user_id ORDER BY s.nama").all() as any[];
  const content = `
    ${okAlert(ctx)}
    <div class="page-head"><h1>Data Siswa</h1></div>
    ${card("Tambah Siswa", `
      <form method="post" action="/admin/siswa" class="inline-form">
        ${field("Nama Lengkap", input("nama", "", { required: true }))}
        ${field("NIS", input("nis", "", { required: true }))}
        ${field("Kelas", select("kelas_id", kelasOptions()))}
        ${field("Username", input("username", "", { required: true }))}
        ${field("Password", input("password", "", { type: "password", required: true }))}
        ${button("Tambah", { tone: "primary" })}
      </form>`)}
    ${rows.length ? table(["NIS", "Nama", "Kelas", "Username", "Aksi"], rows.map((r) => [
      esc(r.nis), `<b>${esc(r.nama)}</b>`, esc(r.kelas_nama ?? "-"), esc(r.username ?? "-"),
      `<div class="row-actions">
        ${linkBtn(`/admin/siswa/${r.id}/edit`, "Edit", "ghost")}
        <form method="post" action="/admin/siswa/${r.id}/delete" class="inline">${button("Hapus", { tone: "danger", confirm: `Hapus siswa ${r.nama}?` })}</form>
      </div>`,
    ])) : emptyState("Belum ada siswa.")}`;
  return wrap(ctx, "Siswa", "/admin/siswa", content);
}

function createSiswa(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const namaVal = (f.get("nama") ?? "").trim();
    const nisVal = (f.get("nis") ?? "").trim();
    const usernameVal = (f.get("username") ?? "").trim();
    const passwordVal = f.get("password") ?? "";
    const kelasId = parseIntSafe(f.get("kelas_id"));
    const err = run(namaVal, nama()) || run(nisVal, [required("NIS"), maxLength(30, "NIS")]) || run(usernameVal, username()) || run(passwordVal, password());
    if (err) return redirect("/admin/siswa?err=" + encodeURIComponent(err));
    try {
      const uid = await createUserHashed(usernameVal, passwordVal, namaVal, "siswa");
      const r = db.run("INSERT INTO siswa (user_id, nis, nama, kelas_id) VALUES (?,?,?,?)", [uid, nisVal, namaVal, kelasId]);
      ensureKehadiranForSiswa(Number(r.lastInsertRowid), kelasId);
      return redirect("/admin/siswa?ok=Siswa ditambahkan");
    } catch (e: any) {
      return redirect("/admin/siswa?err=" + encodeURIComponent("Username/NIS sudah dipakai atau data tidak valid."));
    }
  })();
}

function editSiswa(user: User, ctx: Ctx): Response {
  const r = db.query("SELECT s.*, u.username FROM siswa s LEFT JOIN users u ON u.id=s.user_id WHERE s.id=?").get(ctx.params.id) as any;
  if (!r) return redirect("/admin/siswa?err=Siswa tidak ditemukan");
  const content = `
    <div class="page-head"><h1>Edit Siswa</h1></div>
    ${card("Form Edit", `
      <form method="post" action="/admin/siswa/${r.id}/update">
        ${field("Nama Lengkap", input("nama", r.nama, { required: true }))}
        ${field("NIS", input("nis", r.nis, { required: true }))}
        ${field("Kelas", select("kelas_id", kelasOptions(r.kelas_id ?? "")))}
        ${field("Username", input("username", r.username ?? "", { required: true }))}
        ${field("Password Baru (kosongkan jika tetap)", input("password", "", { type: "password" }))}
        <div class="form-actions">${button("Simpan", { tone: "primary" })} ${linkBtn("/admin/siswa", "Batal", "ghost")}</div>
      </form>`)}`;
  return wrap(ctx, "Edit Siswa", "/admin/siswa", content);
}

function updateSiswa(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const namaVal = (f.get("nama") ?? "").trim();
    const nisVal = (f.get("nis") ?? "").trim();
    const usernameVal = (f.get("username") ?? "").trim();
    const passwordVal = f.get("password") ?? "";
    const kelasId = parseIntSafe(f.get("kelas_id"));
    let err = run(namaVal, nama()) || run(nisVal, [required("NIS"), maxLength(30, "NIS")]) || run(usernameVal, username());
    if (err) return redirect("/admin/siswa?err=" + encodeURIComponent(err));
    if (passwordVal) {
      const pwErr = run(passwordVal, password());
      if (pwErr) return redirect("/admin/siswa?err=" + encodeURIComponent(pwErr));
    }
    try {
      const s = db.query("SELECT user_id FROM siswa WHERE id=?").get(ctx.params.id) as any;
      if (s?.user_id) {
        db.run("UPDATE users SET username=?, nama=? WHERE id=?", [usernameVal, namaVal, s.user_id]);
        if (passwordVal) db.run("UPDATE users SET password_hash=? WHERE id=?", [await hashPassword(passwordVal), s.user_id]);
      }
      db.run("UPDATE siswa SET nis=?, nama=?, kelas_id=? WHERE id=?", [nisVal, namaVal, kelasId, ctx.params.id]);
      ensureKehadiranForSiswa(Number(ctx.params.id), kelasId);
      return redirect("/admin/siswa?ok=Siswa diperbarui");
    } catch (e: any) {
      return redirect("/admin/siswa?err=" + encodeURIComponent("Username/NIS sudah dipakai."));
    }
  })();
}

function deleteSiswa(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const s = db.query("SELECT user_id FROM siswa WHERE id=?").get(ctx.params.id) as any;
    if (s?.user_id) db.run("DELETE FROM users WHERE id=?", [s.user_id]);
    return redirect("/admin/siswa?ok=Siswa dihapus");
  })();
}

// ---------- Orang Tua ----------
function listOrtu(user: User, ctx: Ctx): Response {
  const rows = db.query("SELECT o.*, s.nama AS siswa_nama, u.username FROM orang_tua o JOIN siswa s ON s.id=o.siswa_id JOIN users u ON u.id=o.user_id ORDER BY o.nama").all() as any[];
  const content = `
    ${okAlert(ctx)}
    <div class="page-head"><h1>Data Orang Tua</h1></div>
    ${card("Tambah Orang Tua", `
      <form method="post" action="/admin/ortu" class="inline-form">
        ${field("Nama", input("nama", "", { required: true }))}
        ${field("Anak (Siswa)", select("siswa_id", siswaOptions()))}
        ${field("Hubungan", select("hubungan", [{ value: "Ayah", label: "Ayah" }, { value: "Ibu", label: "Ibu" }, { value: "Wali", label: "Wali" }]))}
        ${field("Username", input("username", "", { required: true }))}
        ${field("Password", input("password", "", { type: "password", required: true }))}
        ${button("Tambah", { tone: "primary" })}
      </form>`)}
    ${rows.length ? table(["Nama", "Anak", "Hubungan", "Username", "Aksi"], rows.map((r) => [
      `<b>${esc(r.nama)}</b>`, esc(r.siswa_nama), esc(r.hubungan ?? "-"), esc(r.username),
      `<div class="row-actions">
        ${linkBtn(`/admin/ortu/${r.id}/edit`, "Edit", "ghost")}
        <form method="post" action="/admin/ortu/${r.id}/delete" class="inline">${button("Hapus", { tone: "danger", confirm: `Hapus orang tua ${r.nama}?` })}</form>
      </div>`,
    ])) : emptyState("Belum ada orang tua.")}`;
  return wrap(ctx, "Orang Tua", "/admin/ortu", content);
}

function createOrtu(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const namaVal = (f.get("nama") ?? "").trim();
    const usernameVal = (f.get("username") ?? "").trim();
    const passwordVal = f.get("password") ?? "";
    const siswaId = parseIntSafe(f.get("siswa_id"));
    const hubunganVal = (f.get("hubungan") ?? "").trim();
    const err = run(namaVal, nama("Nama")) || run(usernameVal, username()) || run(passwordVal, password()) || (siswaId ? null : "Siswa (anak) wajib dipilih.") || run(hubunganVal, [required("Hubungan"), pattern(/^(Ayah|Ibu|Wali)$/, "Hubungan tidak valid.")]);
    if (err) return redirect("/admin/ortu?err=" + encodeURIComponent(err));
    try {
      const uid = await createUserHashed(usernameVal, passwordVal, namaVal, "orang_tua");
      db.run("INSERT INTO orang_tua (user_id, siswa_id, nama, hubungan) VALUES (?,?,?,?)", [uid, siswaId, namaVal, hubunganVal || "Wali"]);
      return redirect("/admin/ortu?ok=Orang tua ditambahkan");
    } catch (e: any) {
      return redirect("/admin/ortu?err=" + encodeURIComponent("Username sudah dipakai."));
    }
  })();
}

function editOrtu(user: User, ctx: Ctx): Response {
  const r = db.query("SELECT o.*, u.username FROM orang_tua o JOIN users u ON u.id=o.user_id WHERE o.id=?").get(ctx.params.id) as any;
  if (!r) return redirect("/admin/ortu?err=Orang tua tidak ditemukan");
  const content = `
    <div class="page-head"><h1>Edit Orang Tua</h1></div>
    ${card("Form Edit", `
      <form method="post" action="/admin/ortu/${r.id}/update">
        ${field("Nama", input("nama", r.nama, { required: true }))}
        ${field("Anak (Siswa)", select("siswa_id", siswaOptions(r.siswa_id)))}
        ${field("Hubungan", select("hubungan", [{ value: "Ayah", label: "Ayah" }, { value: "Ibu", label: "Ibu" }, { value: "Wali", label: "Wali" }], r.hubungan ?? ""))}
        ${field("Username", input("username", r.username, { required: true }))}
        ${field("Password Baru (kosongkan jika tetap)", input("password", "", { type: "password" }))}
        <div class="form-actions">${button("Simpan", { tone: "primary" })} ${linkBtn("/admin/ortu", "Batal", "ghost")}</div>
      </form>`)}`;
  return wrap(ctx, "Edit Orang Tua", "/admin/ortu", content);
}

function updateOrtu(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const namaVal = (f.get("nama") ?? "").trim();
    const usernameVal = (f.get("username") ?? "").trim();
    const passwordVal = f.get("password") ?? "";
    const siswaId = parseIntSafe(f.get("siswa_id"));
    const hubunganVal = (f.get("hubungan") ?? "").trim();
    let err = run(namaVal, nama("Nama")) || run(usernameVal, username()) || (siswaId ? null : "Siswa (anak) wajib dipilih.") || run(hubunganVal, [required("Hubungan"), pattern(/^(Ayah|Ibu|Wali)$/, "Hubungan tidak valid.")]);
    if (err) return redirect("/admin/ortu?err=" + encodeURIComponent(err));
    if (passwordVal) {
      const pwErr = run(passwordVal, password());
      if (pwErr) return redirect("/admin/ortu?err=" + encodeURIComponent(pwErr));
    }
    try {
      const o = db.query("SELECT user_id FROM orang_tua WHERE id=?").get(ctx.params.id) as any;
      db.run("UPDATE users SET username=?, nama=? WHERE id=?", [usernameVal, namaVal, o.user_id]);
      if (passwordVal) db.run("UPDATE users SET password_hash=? WHERE id=?", [await hashPassword(passwordVal), o.user_id]);
      db.run("UPDATE orang_tua SET siswa_id=?, nama=?, hubungan=? WHERE id=?", [siswaId, namaVal, hubunganVal || "Wali", ctx.params.id]);
      return redirect("/admin/ortu?ok=Orang tua diperbarui");
    } catch (e: any) {
      return redirect("/admin/ortu?err=" + encodeURIComponent("Username sudah dipakai."));
    }
  })();
}

function deleteOrtu(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const o = db.query("SELECT user_id FROM orang_tua WHERE id=?").get(ctx.params.id) as any;
    if (o) db.run("DELETE FROM users WHERE id=?", [o.user_id]);
    return redirect("/admin/ortu?ok=Orang tua dihapus");
  })();
}

// ---------- Pengguna (admin & kepala sekolah) ----------
function listUser(user: User, ctx: Ctx): Response {
  const rows = db.query("SELECT * FROM users ORDER BY role, nama").all() as any[];
  const content = `
    ${okAlert(ctx)}
    <div class="page-head"><h1>Data User</h1></div>
    ${card("Tambah User (Admin / Kepala Sekolah)", `
      <form method="post" action="/admin/user" class="inline-form">
        ${field("Nama Lengkap", input("nama", "", { required: true }))}
        ${field("Username", input("username", "", { required: true }))}
        ${field("Password", input("password", "", { type: "password", required: true }))}
        ${field("Role", select("role", [{ value: "admin", label: "Admin" }, { value: "kepala_sekolah", label: "Kepala Sekolah" }]))}
        ${button("Tambah", { tone: "primary" })}
      </form>
      <p class="muted">Akun guru/siswa/orang tua dibuat melalui menu masing-masing.</p>`)}
    ${rows.length ? table(["Nama", "Username", "Role", "Aksi"], rows.map((r) => [
      `<b>${esc(r.nama)}</b>`, esc(r.username), `<span class="muted">${roleLabel(r.role)}</span>`,
      `<div class="row-actions">
        ${linkBtn(`/admin/user/${r.id}/edit`, "Edit", "ghost")}
        ${r.role !== "admin" || r.id !== user.id
          ? `<form method="post" action="/admin/user/${r.id}/delete" class="inline">${button("Hapus", { tone: "danger", confirm: `Hapus user ${r.username}?` })}</form>`
          : ""}
      </div>`,
    ])) : emptyState("Belum ada user.")}`;
  return wrap(ctx, "Pengguna", "/admin/user", content);
}

function createUser(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const namaVal = (f.get("nama") ?? "").trim();
    const usernameVal = (f.get("username") ?? "").trim();
    const passwordVal = f.get("password") ?? "";
    const roleVal = (f.get("role") ?? "").trim();
    const err = run(namaVal, nama()) || run(usernameVal, username()) || run(passwordVal, password()) || run(roleVal, [required("Role"), pattern(/^(admin|kepala_sekolah)$/, "Role tidak valid.")]);
    if (err) return redirect("/admin/user?err=" + encodeURIComponent(err));
    try {
      await createUserHashed(usernameVal, passwordVal, namaVal, roleVal);
      return redirect("/admin/user?ok=User ditambahkan");
    } catch (e: any) {
      return redirect("/admin/user?err=" + encodeURIComponent("Username sudah dipakai."));
    }
  })();
}

function editUser(user: User, ctx: Ctx): Response {
  const r = db.query("SELECT * FROM users WHERE id=?").get(ctx.params.id) as any;
  if (!r) return redirect("/admin/user?err=User tidak ditemukan");
  const content = `
    <div class="page-head"><h1>Edit User</h1></div>
    ${card("Form Edit", `
      <form method="post" action="/admin/user/${r.id}/update">
        ${field("Nama Lengkap", input("nama", r.nama, { required: true }))}
        ${field("Username", input("username", r.username, { required: true }))}
        ${field("Password Baru (kosongkan jika tetap)", input("password", "", { type: "password" }))}
        ${field("Role", select("role", [{ value: "admin", label: "Admin" }, { value: "kepala_sekolah", label: "Kepala Sekolah" }], r.role))}
        <div class="form-actions">${button("Simpan", { tone: "primary" })} ${linkBtn("/admin/user", "Batal", "ghost")}</div>
      </form>`)}`;
  return wrap(ctx, "Edit User", "/admin/user", content);
}

function updateUser(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const namaVal = (f.get("nama") ?? "").trim();
    const usernameVal = (f.get("username") ?? "").trim();
    const passwordVal = f.get("password") ?? "";
    const roleVal = (f.get("role") ?? "").trim();
    let err = run(namaVal, nama()) || run(usernameVal, username()) || run(roleVal, [required("Role"), pattern(/^(admin|kepala_sekolah)$/, "Role tidak valid.")]);
    if (err) return redirect("/admin/user?err=" + encodeURIComponent(err));
    if (passwordVal) {
      const pwErr = run(passwordVal, password());
      if (pwErr) return redirect("/admin/user?err=" + encodeURIComponent(pwErr));
    }
    try {
      db.run("UPDATE users SET username=?, nama=?, role=? WHERE id=?", [usernameVal, namaVal, roleVal, ctx.params.id]);
      if (passwordVal) db.run("UPDATE users SET password_hash=? WHERE id=?", [await hashPassword(passwordVal), ctx.params.id]);
      return redirect("/admin/user?ok=User diperbarui");
    } catch (e: any) {
      return redirect("/admin/user?err=" + encodeURIComponent("Username sudah dipakai."));
    }
  })();
}

function deleteUser(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    db.run("DELETE FROM users WHERE id=?", [ctx.params.id]);
    return redirect("/admin/user?ok=User dihapus");
  })();
}

// ---------- Jadwal ----------
function listJadwal(user: User, ctx: Ctx): Response {
  const rows = db.query(`
    SELECT j.*, k.nama AS kelas_nama, mp.nama AS mapel_nama, g.nama AS guru_nama
    FROM jadwal j JOIN kelas k ON k.id=j.kelas_id
    JOIN mata_pelajaran mp ON mp.id=j.mata_pelajaran_id
    JOIN guru g ON g.id=j.guru_id
    ORDER BY j.hari, j.jam_mulai, k.nama
  `).all() as any[];
  const content = `
    ${okAlert(ctx)}
    <div class="page-head"><h1>Jadwal Pelajaran</h1></div>
    ${card("Tambah Jadwal", `
      <form method="post" action="/admin/jadwal" class="inline-form">
        ${field("Kelas", select("kelas_id", kelasOptions()))}
        ${field("Mapel", select("mata_pelajaran_id", mapelOptions()))}
        ${field("Guru", select("guru_id", guruOptions()))}
        ${field("Hari", select("hari", [0,1,2,3,4,5,6].map((d) => ({ value: d, label: dayName(d) }))))}
        ${field("Jam Mulai", input("jam_mulai", "07:30", { type: "time", required: true }))}
        ${field("Jam Selesai", input("jam_selesai", "09:00", { type: "time", required: true }))}
        ${button("Tambah", { tone: "primary" })}
      </form>`)}
    ${rows.length ? table(["Hari", "Jam", "Kelas", "Mapel", "Guru", "Aksi"], rows.map((r) => [
      dayName(r.hari), `${r.jam_mulai}–${r.jam_selesai}`, esc(r.kelas_nama), esc(r.mapel_nama), esc(r.guru_nama),
      `<div class="row-actions">
        ${linkBtn(`/admin/jadwal/${r.id}/edit`, "Edit", "ghost")}
        <form method="post" action="/admin/jadwal/${r.id}/delete" class="inline">${button("Hapus", { tone: "danger", confirm: "Hapus jadwal ini?" })}</form>
      </div>`,
    ])) : emptyState("Belum ada jadwal.")}`;
  return wrap(ctx, "Jadwal", "/admin/jadwal", content);
}

function createJadwal(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const kelasId = parseIntSafe(f.get("kelas_id"));
    const mapelId = parseIntSafe(f.get("mata_pelajaran_id"));
    const guruId = parseIntSafe(f.get("guru_id"));
    const hariVal = (f.get("hari") ?? "").trim();
    const jamMulai = (f.get("jam_mulai") ?? "").trim();
    const jamSelesai = (f.get("jam_selesai") ?? "").trim();
    const err = (kelasId ? null : "Kelas wajib dipilih.") || (mapelId ? null : "Mata pelajaran wajib dipilih.") || (guruId ? null : "Guru wajib dipilih.") || run(hariVal, [required("Hari"), hariValid()]) || run(jamMulai, [required("Jam mulai"), time("Jam mulai")]) || run(jamSelesai, [required("Jam selesai"), time("Jam selesai")]) || timeRange("Jam mulai", "Jam selesai")(jamMulai, jamSelesai);
    if (err) return redirect("/admin/jadwal?err=" + encodeURIComponent(err));
    db.run("INSERT INTO jadwal (kelas_id, mata_pelajaran_id, guru_id, hari, jam_mulai, jam_selesai) VALUES (?,?,?,?,?,?)", [
      kelasId, mapelId, guruId, hariVal, jamMulai, jamSelesai,
    ]);
    return redirect("/admin/jadwal?ok=Jadwal ditambahkan");
  })();
}

function editJadwal(user: User, ctx: Ctx): Response {
  const r = db.query("SELECT * FROM jadwal WHERE id=?").get(ctx.params.id) as any;
  if (!r) return redirect("/admin/jadwal?err=Jadwal tidak ditemukan");
  const content = `
    <div class="page-head"><h1>Edit Jadwal</h1></div>
    ${card("Form Edit", `
      <form method="post" action="/admin/jadwal/${r.id}/update">
        ${field("Kelas", select("kelas_id", kelasOptions(r.kelas_id)))}
        ${field("Mapel", select("mata_pelajaran_id", mapelOptions(r.mata_pelajaran_id)))}
        ${field("Guru", select("guru_id", guruOptions(r.guru_id)))}
        ${field("Hari", select("hari", [0,1,2,3,4,5,6].map((d) => ({ value: d, label: dayName(d) })), r.hari))}
        ${field("Jam Mulai", input("jam_mulai", r.jam_mulai, { type: "time", required: true }))}
        ${field("Jam Selesai", input("jam_selesai", r.jam_selesai, { type: "time", required: true }))}
        <div class="form-actions">${button("Simpan", { tone: "primary" })} ${linkBtn("/admin/jadwal", "Batal", "ghost")}</div>
      </form>`)}`;
  return wrap(ctx, "Edit Jadwal", "/admin/jadwal", content);
}

function updateJadwal(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    const kelasId = parseIntSafe(f.get("kelas_id"));
    const mapelId = parseIntSafe(f.get("mata_pelajaran_id"));
    const guruId = parseIntSafe(f.get("guru_id"));
    const hariVal = (f.get("hari") ?? "").trim();
    const jamMulai = (f.get("jam_mulai") ?? "").trim();
    const jamSelesai = (f.get("jam_selesai") ?? "").trim();
    const err = (kelasId ? null : "Kelas wajib dipilih.") || (mapelId ? null : "Mata pelajaran wajib dipilih.") || (guruId ? null : "Guru wajib dipilih.") || run(hariVal, [required("Hari"), hariValid()]) || run(jamMulai, [required("Jam mulai"), time("Jam mulai")]) || run(jamSelesai, [required("Jam selesai"), time("Jam selesai")]) || timeRange("Jam mulai", "Jam selesai")(jamMulai, jamSelesai);
    if (err) return redirect("/admin/jadwal?err=" + encodeURIComponent(err));
    db.run("UPDATE jadwal SET kelas_id=?, mata_pelajaran_id=?, guru_id=?, hari=?, jam_mulai=?, jam_selesai=? WHERE id=?", [
      kelasId, mapelId, guruId, hariVal, jamMulai, jamSelesai, ctx.params.id,
    ]);
    return redirect("/admin/jadwal?ok=Jadwal diperbarui");
  })();
}

function deleteJadwal(req: Request, ctx: Ctx): Response {
  return (async () => {
    const f = await readForm(req);
    const csrfErr = validateCsrf(f, ctx.csrf);
    if (csrfErr) return new Response(csrfErr, { status: 403 });
    db.run("DELETE FROM jadwal WHERE id=?", [ctx.params.id]);
    return redirect("/admin/jadwal?ok=Jadwal dihapus");
  })();
}

// ---------- Rekap ----------
function rekap(user: User, ctx: Ctx): Response {
  const kelasId = ctx.query.get("kelas_id") ?? "";
  const tanggal = ctx.query.get("tanggal") ?? todayStr();

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
    SELECT k.status, COUNT(*) c
    FROM kehadiran k JOIN sesi_mengajar s ON s.id = k.sesi_id
    JOIN jadwal j ON j.id = s.jadwal_id
    JOIN kelas kk ON kk.id = j.kelas_id
    WHERE s.tanggal = ? ${kelasId ? "AND kk.id = ?" : ""}
    GROUP BY k.status
  `).all(kelasId ? [tanggal, kelasId] : [tanggal]) as { status: string; c: number }[];
  const sc: Record<string, number> = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
  for (const r of statusCounts) sc[r.status] = r.c;

  const detailRows = db.query(`
    SELECT k.status, k.keterangan, sw.nama AS siswa_nama, sw.nis, mp.nama AS mapel_nama, j.jam_mulai
    FROM kehadiran k
    JOIN sesi_mengajar s ON s.id = k.sesi_id
    JOIN jadwal j ON j.id = s.jadwal_id
    JOIN mata_pelajaran mp ON mp.id = j.mata_pelajaran_id
    JOIN siswa sw ON sw.id = k.siswa_id
    JOIN kelas kk ON kk.id = j.kelas_id
    WHERE s.tanggal = ? ${kelasId ? "AND kk.id = ?" : ""}
    ORDER BY j.jam_mulai, sw.nama
  `).all(kelasId ? [tanggal, kelasId] : [tanggal]) as any[];

  const content = `
    ${okAlert(ctx)}
    <div class="page-head"><h1>Rekap Kehadiran</h1></div>
    ${card("Filter", `
      <form method="get" action="/admin/rekap" class="inline-form">
        ${field("Kelas", select("kelas_id", [{ value: "", label: "Semua Kelas" }, ...kelasOptions()], kelasId))}
        ${field("Tanggal", input("tanggal", tanggal, { type: "date", required: true }))}
        ${button("Tampilkan", { tone: "primary" })}
      </form>`)}
    <div class="stat-grid small">
      ${statCard("Hadir", sc.hadir, "✅", "tone-green")}
      ${statCard("Sakit", sc.sakit, "🤒", "tone-yellow")}
      ${statCard("Izin", sc.izin, "📄", "tone-blue")}
      ${statCard("Alpa", sc.alpha, "❌", "tone-red")}
    </div>
    ${sesiRows.length ? card("Sesi Mengajar", table(
      ["Jam", "Kelas", "Mapel", "Guru", "Status"],
      sesiRows.map((s) => [`${s.jam_mulai}–${s.jam_selesai}`, esc(s.kelas_nama), esc(s.mapel_nama), esc(s.guru_nama), badge(s.status)]),
    )) : emptyState("Belum ada sesi pada tanggal ini.")}
    ${detailRows.length ? card("Detail Kehadiran", table(
      ["Jam", "Mapel", "NIS", "Nama Siswa", "Status", "Keterangan"],
      detailRows.map((r) => [r.jam_mulai, esc(r.mapel_nama), esc(r.nis), esc(r.siswa_nama), badge(r.status), esc(r.keterangan ?? "-")]),
    )) : ""}`;
  return wrap(ctx, "Rekap Kehadiran", "/admin/rekap", content);
}

// ---------- Registrasi route ----------
export function registerAdmin() {
  add("GET", "/admin", (req, ctx) => {
    const u = requireRole(ctx, "admin"); if (u instanceof Response) return u;
    return dashboard(u, ctx);
  });
  add("POST", "/admin/pengumuman", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return createPengumumanAdmin(req, ctx); });

  add("GET", "/admin/kelas", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return listKelas(u, ctx); });
  add("POST", "/admin/kelas", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return createKelas(req, ctx); });
  add("GET", "/admin/kelas/:id/edit", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return editKelas(u, ctx); });
  add("POST", "/admin/kelas/:id/update", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return updateKelas(req, ctx); });
  add("POST", "/admin/kelas/:id/delete", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return deleteKelas(req, ctx); });

  add("GET", "/admin/mapel", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return listMapel(u, ctx); });
  add("POST", "/admin/mapel", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return createMapel(req, ctx); });
  add("GET", "/admin/mapel/:id/edit", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return editMapel(u, ctx); });
  add("POST", "/admin/mapel/:id/update", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return updateMapel(req, ctx); });
  add("POST", "/admin/mapel/:id/delete", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return deleteMapel(req, ctx); });

  add("GET", "/admin/guru", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return listGuru(u, ctx); });
  add("POST", "/admin/guru", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return createGuru(req, ctx); });
  add("GET", "/admin/guru/:id/edit", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return editGuru(u, ctx); });
  add("POST", "/admin/guru/:id/update", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return updateGuru(req, ctx); });
  add("POST", "/admin/guru/:id/delete", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return deleteGuru(req, ctx); });

  add("GET", "/admin/siswa", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return listSiswa(u, ctx); });
  add("POST", "/admin/siswa", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return createSiswa(req, ctx); });
  add("GET", "/admin/siswa/:id/edit", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return editSiswa(u, ctx); });
  add("POST", "/admin/siswa/:id/update", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return updateSiswa(req, ctx); });
  add("POST", "/admin/siswa/:id/delete", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return deleteSiswa(req, ctx); });

  add("GET", "/admin/ortu", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return listOrtu(u, ctx); });
  add("POST", "/admin/ortu", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return createOrtu(req, ctx); });
  add("GET", "/admin/ortu/:id/edit", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return editOrtu(u, ctx); });
  add("POST", "/admin/ortu/:id/update", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return updateOrtu(req, ctx); });
  add("POST", "/admin/ortu/:id/delete", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return deleteOrtu(req, ctx); });

  add("GET", "/admin/user", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return listUser(u, ctx); });
  add("POST", "/admin/user", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return createUser(req, ctx); });
  add("GET", "/admin/user/:id/edit", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return editUser(u, ctx); });
  add("POST", "/admin/user/:id/update", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return updateUser(req, ctx); });
  add("POST", "/admin/user/:id/delete", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return deleteUser(req, ctx); });

  add("GET", "/admin/jadwal", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return listJadwal(u, ctx); });
  add("POST", "/admin/jadwal", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return createJadwal(req, ctx); });
  add("GET", "/admin/jadwal/:id/edit", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return editJadwal(u, ctx); });
  add("POST", "/admin/jadwal/:id/update", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return updateJadwal(req, ctx); });
  add("POST", "/admin/jadwal/:id/delete", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return deleteJadwal(req, ctx); });

  add("GET", "/admin/rekap", (req, ctx) => { const u = requireRole(ctx, "admin"); if (u instanceof Response) return u; return rekap(u, ctx); });
}
