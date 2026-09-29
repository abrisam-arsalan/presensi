// Smoke test in-process: jalankan seluruh routing tanpa server jaringan.
import { initSchema, seedIfEmpty, db } from "../src/db";
import { dispatch } from "../src/router";
import { registerAuth } from "../src/routes/auth";
import { registerAdmin } from "../src/routes/admin";
import { registerKepala } from "../src/routes/kepala";
import { registerGuru } from "../src/routes/guru";
import { registerSiswa } from "../src/routes/siswa";
import { registerOrtu } from "../src/routes/ortu";
import { todayStr } from "../src/util";
import { csrfToken } from "../src/auth";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}`);
  }
}

async function req(method: string, path: string, opts: { body?: URLSearchParams; cookie?: string } = {}) {
  const headers: Record<string, string> = {};
  let body = opts.body;
  if (method === "POST" && opts.cookie) {
    const token = opts.cookie.split("=")[1];
    if (token) {
      body = body ? new URLSearchParams(body) : new URLSearchParams();
      body.set("_csrf", csrfToken(token));
    }
  }
  if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  const r = new Request("http://localhost" + path, {
    method,
    headers,
    body: body ? body.toString() : undefined,
  });
  return dispatch(r);
}

async function login(username: string, password: string) {
  const resp = await req("POST", "/login", { body: new URLSearchParams({ username, password }) });
  const cookie = (resp.headers.get("set-cookie") ?? "").split(";")[0];
  return { resp, cookie };
}

async function main() {
  initSchema();
  await seedIfEmpty();
  registerAuth();
  registerAdmin();
  registerKepala();
  registerGuru();
  registerSiswa();
  registerOrtu();

  console.log("\n== Smoke test SekolahApp ==\n");

  // 1. Login page
  const lp = await req("GET", "/login");
  const lpText = await lp.text();
  check("GET /login menampilkan form", lp.status === 200 && lpText.includes("Masuk"));

  // 2. Login admin
  const admin = await login("admin", "admin123");
  check("Login admin redirect /admin", admin.resp.status === 302 && admin.resp.headers.get("location") === "/admin");
  check("Login admin set cookie", admin.cookie.startsWith("sk_session="));
  const adminDash = await (await req("GET", "/admin", { cookie: admin.cookie })).text();
  check("GET /admin = dashboard", adminDash.includes("Dashboard Admin"));

  // 3. Login kepsek
  const kepsek = await login("kepsek", "kepsek123");
  check("Login kepsek redirect /kepala", kepsek.resp.headers.get("location") === "/kepala");
  const kepsekDash = await (await req("GET", "/kepala", { cookie: kepsek.cookie })).text();
  check("GET /kepala = monitoring", kepsekDash.includes("Dashboard Monitoring"));

  // 4. Login guru
  const guru = await login("guru.budi", "guru123");
  check("Login guru redirect /guru", guru.resp.headers.get("location") === "/guru");
  const guruDash = await (await req("GET", "/guru", { cookie: guru.cookie })).text();
  check("GET /guru = jadwal (hari ini / terdekat)", guruDash.includes("Jadwal Hari Ini") || guruDash.includes("Jadwal Mengajar Terdekat"));

  // 5. Guru membuka absensi → default semua hadir
  const jadwal = db.query(
    "SELECT j.id, j.kelas_id FROM jadwal j JOIN guru g ON g.id=j.guru_id JOIN users u ON u.id=g.user_id WHERE u.username='guru.budi' ORDER BY j.id LIMIT 1",
  ).get() as { id: number; kelas_id: number };
  const t = todayStr();
  const absen = await req("GET", `/guru/absen?jadwal=${jadwal.id}&tanggal=${t}`, { cookie: guru.cookie });
  const absenText = await absen.text();
  check("GET /guru/absen = halaman absensi", absen.status === 200 && absenText.includes("Absensi"));
  check("Absensi menampilkan daftar siswa", absenText.includes("Daftar Siswa"));
  const sesi = db.query("SELECT id FROM sesi_mengajar WHERE jadwal_id=? AND tanggal=?").get(jadwal.id, t) as { id: number };
  const defaultHadir = db.query("SELECT COUNT(*) c FROM kehadiran WHERE sesi_id=? AND status='hadir'").get(sesi.id) as { c: number };
  const totalSiswa = db.query("SELECT COUNT(*) c FROM siswa WHERE kelas_id=?").get(jadwal.kelas_id) as { c: number };
  check("Default semua siswa hadir", defaultHadir.c === totalSiswa.c && totalSiswa.c > 0);

  // 6. Simpan absensi (ubah 1 siswa jadi alpa)
  const siswaId = db.query("SELECT id FROM siswa WHERE kelas_id=? ORDER BY id LIMIT 1").get(jadwal.kelas_id) as { id: number };
  const body = new URLSearchParams({ jadwal: String(jadwal.id), tanggal: t, materi: "Bab 1", catatan_kelas: "PR hal 10", action: "save" });
  const kelasSiswa = db.query("SELECT id FROM siswa WHERE kelas_id=?").all(jadwal.kelas_id) as { id: number }[];
  for (const s of kelasSiswa) {
    body.set(`status_${s.id}`, s.id === siswaId.id ? "alpha" : "hadir");
    body.set(`ket_${s.id}`, "");
  }
  const save = await req("POST", "/guru/absen", { body, cookie: guru.cookie });
  check("POST /guru/absen redirect sukses", save.status === 302 && (save.headers.get("location") ?? "").includes("ok="));
  const after = db.query("SELECT status FROM kehadiran WHERE sesi_id=? AND siswa_id=?").get(sesi.id, siswaId.id) as { status: string };
  check("Status siswa tersimpan (alpa)", after.status === "alpha");
  const materiSaved = db.query("SELECT materi FROM sesi_mengajar WHERE id=?").get(sesi.id) as { materi: string };
  check("Materi tersimpan", materiSaved.materi === "Bab 1");

  // 7. Login siswa
  const siswa = await login("siswa.andi", "siswa123");
  check("Login siswa redirect /siswa", siswa.resp.headers.get("location") === "/siswa");
  const siswaDash = await (await req("GET", "/siswa", { cookie: siswa.cookie })).text();
  check("GET /siswa = dashboard", siswaDash.includes("Dashboard Siswa") || siswaDash.includes("Halo"));

  // 8. Login ortu
  const ortu = await login("orangtua.surya", "ortu123");
  check("Login ortu redirect /orangtua", ortu.resp.headers.get("location") === "/orangtua");
  const ortuDash = await (await req("GET", "/orangtua", { cookie: ortu.cookie })).text();
  check("GET /orangtua = dashboard", ortuDash.includes("Halo") || ortuDash.includes("Dashboard Orang Tua"));

  // 9. RBAC: siswa tidak boleh buka /admin
  const forbid = await req("GET", "/admin", { cookie: siswa.cookie });
  check("RBAC siswa ditolak dari /admin", forbid.status === 302 && forbid.headers.get("location") === "/siswa");

  // 10. Admin CRUD kelas
  const createKelas = await req("POST", "/admin/kelas", { body: new URLSearchParams({ nama: "Test Kelas", tingkat: "X", wali_kelas: "Test" }), cookie: admin.cookie });
  check("POST /admin/kelas redirect", createKelas.status === 302);
  const kelasRow = db.query("SELECT id FROM kelas WHERE nama='Test Kelas'").get() as { id: number };
  check("Kelas tersimpan di DB", !!kelasRow);
  if (kelasRow) {
    await req("POST", `/admin/kelas/${kelasRow.id}/delete`, { cookie: admin.cookie });
    check("Kelas dihapus", !db.query("SELECT id FROM kelas WHERE id=?").get(kelasRow.id));
  }

  // 11. Pengumuman
  const adminDash2 = await (await req("GET", "/admin", { cookie: admin.cookie })).text();
  check("Admin dashboard menampilkan Pengumuman", adminDash2.includes("Pengumuman"));
  const createPeng = await req("POST", "/admin/pengumuman", { body: new URLSearchParams({ judul: "Test Pengumuman Umum", isi: "Isi test" }), cookie: admin.cookie });
  check("POST /admin/pengumuman redirect", createPeng.status === 302);
  const pengRow = db.query("SELECT target FROM pengumuman WHERE judul='Test Pengumuman Umum'").get() as { target: string } | null;
  check("Pengumuman admin tersimpan (semua)", !!pengRow && pengRow.target === "semua");
  const siswaDash2 = await (await req("GET", "/siswa", { cookie: siswa.cookie })).text();
  check("Siswa melihat pengumuman umum", siswaDash2.includes("Test Pengumuman Umum"));

  const guruPeng = await req("POST", "/guru/pengumuman", { body: new URLSearchParams({ jadwal_id: String(jadwal.id), judul: "Tugas Test Kelas", isi: "Kerjakan" }), cookie: guru.cookie });
  check("POST /guru/pengumuman redirect", guruPeng.status === 302);
  const guruPengRow = db.query("SELECT target, kelas_id FROM pengumuman WHERE judul='Tugas Test Kelas'").get() as { target: string; kelas_id: number } | null;
  check("Pengumuman guru tersimpan (kelas)", !!guruPengRow && guruPengRow.target === "kelas");
  const siswaDash3 = await (await req("GET", "/siswa", { cookie: siswa.cookie })).text();
  check("Siswa melihat pengumuman kelasnya", siswaDash3.includes("Tugas Test Kelas"));

  console.log(`\nHasil: ${passed} lulus, ${failed} gagal\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Smoke test error:", e);
  process.exit(1);
});
