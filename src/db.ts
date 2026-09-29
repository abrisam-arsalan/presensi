import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const dataDir = join(import.meta.dir, "..", "data");
mkdirSync(dataDir, { recursive: true });

export const db = new Database(join(dataDir, "sekolah.db"));
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nama TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','kepala_sekolah','guru','siswa','orang_tua')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS kelas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      tingkat TEXT,
      wali_kelas TEXT
    );

    CREATE TABLE IF NOT EXISTS mata_pelajaran (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama TEXT NOT NULL,
      kode TEXT
    );

    CREATE TABLE IF NOT EXISTS guru (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      nip TEXT,
      nama TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS siswa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      nis TEXT NOT NULL UNIQUE,
      nama TEXT NOT NULL,
      kelas_id INTEGER REFERENCES kelas(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS orang_tua (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      siswa_id INTEGER NOT NULL REFERENCES siswa(id) ON DELETE CASCADE,
      nama TEXT NOT NULL,
      hubungan TEXT
    );

    CREATE TABLE IF NOT EXISTS jadwal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kelas_id INTEGER NOT NULL REFERENCES kelas(id) ON DELETE CASCADE,
      mata_pelajaran_id INTEGER NOT NULL REFERENCES mata_pelajaran(id) ON DELETE CASCADE,
      guru_id INTEGER NOT NULL REFERENCES guru(id) ON DELETE CASCADE,
      hari INTEGER NOT NULL,
      jam_mulai TEXT NOT NULL,
      jam_selesai TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sesi_mengajar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jadwal_id INTEGER NOT NULL REFERENCES jadwal(id) ON DELETE CASCADE,
      guru_id INTEGER NOT NULL REFERENCES guru(id) ON DELETE CASCADE,
      tanggal TEXT NOT NULL,
      materi TEXT NOT NULL DEFAULT '',
      catatan_kelas TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'dibuka' CHECK (status IN ('dibuka','selesai')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(jadwal_id, tanggal)
    );

    CREATE TABLE IF NOT EXISTS kehadiran (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sesi_id INTEGER NOT NULL REFERENCES sesi_mengajar(id) ON DELETE CASCADE,
      siswa_id INTEGER NOT NULL REFERENCES siswa(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'hadir' CHECK (status IN ('hadir','sakit','izin','alpha')),
      keterangan TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(sesi_id, siswa_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pengumuman (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      judul TEXT NOT NULL,
      isi TEXT NOT NULL,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_nama TEXT NOT NULL,
      author_role TEXT NOT NULL,
      target TEXT NOT NULL DEFAULT 'semua' CHECK (target IN ('semua','kelas')),
      kelas_id INTEGER REFERENCES kelas(id) ON DELETE CASCADE,
      jadwal_id INTEGER REFERENCES jadwal(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_siswa_kelas ON siswa(kelas_id);
    CREATE INDEX IF NOT EXISTS idx_orang_tua_siswa ON orang_tua(siswa_id);
    CREATE INDEX IF NOT EXISTS idx_jadwal_kelas ON jadwal(kelas_id);
    CREATE INDEX IF NOT EXISTS idx_jadwal_guru ON jadwal(guru_id);
    CREATE INDEX IF NOT EXISTS idx_jadwal_mapel ON jadwal(mata_pelajaran_id);
    CREATE INDEX IF NOT EXISTS idx_sesi_jadwal ON sesi_mengajar(jadwal_id);
    CREATE INDEX IF NOT EXISTS idx_sesi_guru_tanggal ON sesi_mengajar(guru_id, tanggal);
    CREATE INDEX IF NOT EXISTS idx_sesi_status ON sesi_mengajar(status);
    CREATE INDEX IF NOT EXISTS idx_kehadiran_sesi ON kehadiran(sesi_id);
    CREATE INDEX IF NOT EXISTS idx_kehadiran_siswa ON kehadiran(siswa_id);
    CREATE INDEX IF NOT EXISTS idx_kehadiran_status ON kehadiran(status);
    CREATE INDEX IF NOT EXISTS idx_pengumuman_kelas ON pengumuman(kelas_id);
    CREATE INDEX IF NOT EXISTS idx_pengumuman_target ON pengumuman(target);
    CREATE INDEX IF NOT EXISTS idx_pengumuman_author ON pengumuman(author_id);
  `);
}

function insertUser(username: string, nama: string, role: string, passwordHash: string): number {
  const r = db.run("INSERT INTO users (username, password_hash, nama, role) VALUES (?,?,?,?)", [
    username, passwordHash, nama, role,
  ]);
  return Number(r.lastInsertRowid);
}

// Pastikan siswa memiliki catatan kehadiran default 'hadir' untuk setiap sesi yang masih dibuka di kelasnya.
export function ensureKehadiranForSiswa(siswaId: number, kelasId: number | null) {
  if (!kelasId) return;
  const openSesi = db.query(`
    SELECT s.id AS sesi_id
    FROM sesi_mengajar s
    JOIN jadwal j ON j.id = s.jadwal_id
    WHERE j.kelas_id = ? AND s.status = 'dibuka'
  `).all(kelasId) as { sesi_id: number }[];
  for (const { sesi_id } of openSesi) {
    db.run("INSERT OR IGNORE INTO kehadiran (sesi_id, siswa_id, status, keterangan) VALUES (?, ?, 'hadir', '')", [sesi_id, siswaId]);
  }
}

export async function seedIfEmpty() {
  const row = db.query("SELECT COUNT(*) AS c FROM users").get() as { c: number };
  if (row.c > 0) return;

  const h = async (pw: string) => Bun.password.hash(pw);

  // ---- Users & role terkait ----
  const adminId = insertUser("admin", "Administrator", "admin", await h("admin123"));
  insertUser("kepsek", "Drs. H. Bambang Wijaya, M.Pd.", "kepala_sekolah", await h("kepsek123"));

  const g1u = insertUser("guru.budi", "Budi Santoso, S.Pd.", "guru", await h("guru123"));
  const g2u = insertUser("guru.siti", "Siti Rahayu, S.Pd.", "guru", await h("guru123"));
  const g1 = Number(db.run("INSERT INTO guru (user_id, nip, nama) VALUES (?,?,?)", [g1u, "198501012010011001", "Budi Santoso, S.Pd."]).lastInsertRowid);
  const g2 = Number(db.run("INSERT INTO guru (user_id, nip, nama) VALUES (?,?,?)", [g2u, "198802022012012002", "Siti Rahayu, S.Pd."]).lastInsertRowid);

  // ---- Mata pelajaran ----
  const mapelDef = [
    ["Matematika", "MTK"],
    ["Bahasa Indonesia", "BIN"],
    ["Bahasa Inggris", "BIG"],
    ["Fisika", "FIS"],
    ["Kimia", "KIM"],
    ["Biologi", "BIO"],
    ["Sejarah Indonesia", "SEJ"],
    ["PJOK", "PJK"],
    ["Seni Budaya", "SBK"],
  ];
  const mapelIds: number[] = [];
  for (const [nama, kode] of mapelDef) {
    mapelIds.push(Number(db.run("INSERT INTO mata_pelajaran (nama, kode) VALUES (?,?)", [nama, kode]).lastInsertRowid));
  }

  // ---- Kelas (SMP: 7, 8, 9) ----
  const kelasDef = [
    ["7A", "7", "Budi Santoso, S.Pd."],
    ["7B", "7", "Siti Rahayu, S.Pd."],
    ["7C", "7", "Budi Santoso, S.Pd."],
    ["8A", "8", "Siti Rahayu, S.Pd."],
    ["8B", "8", "Budi Santoso, S.Pd."],
    ["8C", "8", "Siti Rahayu, S.Pd."],
    ["9A", "9", "Budi Santoso, S.Pd."],
    ["9B", "9", "Siti Rahayu, S.Pd."],
    ["9C", "9", "Siti Rahayu, S.Pd."],
  ];
  const kelasIds: number[] = [];
  for (const [nama, tingkat, wali] of kelasDef) {
    kelasIds.push(Number(db.run("INSERT INTO kelas (nama, tingkat, wali_kelas) VALUES (?,?,?)", [nama, tingkat, wali]).lastInsertRowid));
  }

  // ---- Siswa (username -> siswa) ----
  const siswaDef: [string, string, string, number][] = [
    ["1001", "Andi Pratama", "siswa.andi", kelasIds[0]], // 7A
    ["1002", "Bunga Citra", "siswa.bunga", kelasIds[0]], // 7A
    ["1003", "Cahyo Nugroho", "siswa.cahyo", kelasIds[1]], // 7B
    ["1004", "Dewi Lestari", "siswa.dewi", kelasIds[1]], // 7B
    ["1005", "Eko Saputra", "siswa.eko", kelasIds[2]], // 7C
    ["1006", "Fitri Handayani", "siswa.fitri", kelasIds[2]], // 7C
    ["1007", "Gilang Ramadhan", "siswa.gilang", kelasIds[3]], // 8A
    ["1008", "Hana Safitri", "siswa.hana", kelasIds[3]], // 8A
    ["1009", "Indra Wijaya", "siswa.indra", kelasIds[4]], // 8B
    ["1010", "Joko Susilo", "siswa.joko", kelasIds[4]], // 8B
    ["1011", "Kartika Sari", "siswa.kartika", kelasIds[5]], // 8C
    ["1012", "Luthfi Hakim", "siswa.luthfi", kelasIds[5]], // 8C
  ];
  const siswaIdByName = new Map<string, number>();
  for (const [nis, nama, username, kelasId] of siswaDef) {
    const uid = insertUser(username, nama, "siswa", await h("siswa123"));
    const sid = Number(db.run("INSERT INTO siswa (user_id, nis, nama, kelas_id) VALUES (?,?,?,?)", [uid, nis, nama, kelasId]).lastInsertRowid);
    siswaIdByName.set(nama, sid);
  }

  // ---- Orang tua ----
  const ortuDef: [string, string, string, string][] = [
    ["orangtua.surya", "Surya Pratama", "Andi Pratama", "Ayah"],
    ["orangtua.ratna", "Ratna Dewi", "Bunga Citra", "Ibu"],
  ];
  for (const [username, nama, anakNama, hubungan] of ortuDef) {
    const uid = insertUser(username, nama, "orang_tua", await h("ortu123"));
    db.run("INSERT INTO orang_tua (user_id, siswa_id, nama, hubungan) VALUES (?,?,?,?)", [
      uid, siswaIdByName.get(anakNama)!, nama, hubungan,
    ]);
  }

  // ---- Jadwal (Senin-Jumat 2 sesi, Sabtu 1 sesi) ----
  const times: [string, string][] = [
    ["07:30", "09:00"],
    ["09:15", "10:45"],
    ["11:00", "12:30"],
  ];
  const guruIds = [g1, g2];
  let slot = 0;
  const ins = db.prepare(
    "INSERT INTO jadwal (kelas_id, mata_pelajaran_id, guru_id, hari, jam_mulai, jam_selesai) VALUES (?,?,?,?,?,?)",
  );
  for (const kid of kelasIds) {
    for (let hari = 1; hari <= 5; hari++) {
      for (let t = 0; t < 2; t++) {
        const [s, e] = times[t];
        ins.run(kid, mapelIds[slot % mapelIds.length], guruIds[slot % guruIds.length], hari, s, e);
        slot++;
      }
    }
    ins.run(kid, mapelIds[slot % mapelIds.length], guruIds[slot % guruIds.length], 6, times[0][0], times[0][1]);
    slot++;
  }

  // ---- Pengumuman contoh ----
  db.run("INSERT INTO pengumuman (judul, isi, author_id, author_nama, author_role, target) VALUES (?,?,?,?,?,'semua')", [
    "Selamat datang Tahun Ajaran Baru",
    "Semua siswa diharapkan hadir tepat waktu mulai pukul 07.00. Gunakan seragam lengkap dan bawa buku pelajaran sesuai jadwal.",
    adminId, "Administrator", "admin",
  ]);
  db.run("INSERT INTO pengumuman (judul, isi, author_id, author_nama, author_role, target, kelas_id) VALUES (?,?,?,?,?,'kelas',?)", [
    "Tugas Matematika Bab 1",
    "Kerjakan latihan soal halaman 12 nomor 1-10. Dikumpulkan pada pertemuan berikutnya.",
    g1u, "Budi Santoso, S.Pd.", "guru", kelasIds[0],
  ]);

  console.log("✅ Seed selesai: admin/admin123, kepsek/kepsek123, guru.budi/guru123, guru.siti/guru123, siswa.*/siswa123, orangtua.*/ortu123");
}
