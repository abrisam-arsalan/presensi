/* ── Import bulk siswa / orang tua dari CSV ────────────────────────
   Pakai: bun run scripts/import-csv.ts <file.csv> [--dry-run]

   Template: templates/template-siswa.csv  → nis,nama,kelas,username,password
             templates/template-ortu.csv   → nama,nis_anak,hubungan,username,password

   Tipe file dideteksi dari header: ada kolom nis_anak → orang tua,
   ada kolom nis → siswa.

   Semua baris divalidasi dulu; bila ada satu saja error, TIDAK ada
   data yang disimpan (all-or-nothing). Gunakan --dry-run untuk
   mengecek tanpa menulis ke database.
*/
import { readFileSync } from "node:fs";
import { db, ensureKehadiranForSiswa, initSchema } from "../src/db";
import { hashPassword } from "../src/auth";

// ---------- CSV parser sederhana (BOM, quote, CRLF) ----------
function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ---------- Validasi (mengikuti src/validate.ts) ----------
const errUsername = (v: string): string | null => {
  const t = v.trim();
  if (!t) return "Username wajib diisi.";
  if (t.length < 3 || t.length > 30) return "Username harus 3-30 karakter.";
  if (!/^[a-zA-Z0-9._]+$/.test(t)) return "Username hanya boleh huruf, angka, titik, atau underscore.";
  return null;
};
const errPassword = (v: string): string | null => {
  if (!v) return "Password wajib diisi.";
  if (v.length < 5 || v.length > 100) return "Password harus 5-100 karakter.";
  return null;
};
const errNama = (v: string, label = "Nama"): string | null => {
  const t = v.trim();
  if (t.length < 2 || t.length > 100) return `${label} harus 2-100 karakter.`;
  if (/[<>]/.test(t)) return `${label} mengandung karakter tidak valid.`;
  return null;
};

type RowErr = { line: number; msg: string };

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Pakai: bun run scripts/import-csv.ts <file.csv> [--dry-run]");
    process.exit(2);
  }
  initSchema();

  const rows = parseCsv(readFileSync(file, "utf-8"));
  if (rows.length < 2) {
    console.error("File CSV kosong (hanya header atau tidak ada baris data).");
    process.exit(2);
  }
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const data = rows.slice(1);
  const isOrtu = header.includes("nis_anak");
  const isSiswa = header.includes("nis");
  if (!isOrtu && !isSiswa) {
    console.error("Header tidak dikenali. Pakai template di folder templates/.");
    process.exit(2);
  }

  const col = (name: string) => header.indexOf(name);
  const errors: RowErr[] = [];
  const seenUsernames = new Set<string>();
  const seenKeys = new Set<string>();

  // Cek duplikat yang sudah ada di DB
  const existingUsernames = new Set(
    (db.query("SELECT username FROM users").all() as { username: string }[]).map((r) => r.username),
  );
  const existingNis = new Set(
    (db.query("SELECT nis FROM siswa").all() as { nis: string }[]).map((r) => r.nis),
  );

  // ---------- Fase 1: validasi semua baris ----------
  if (isSiswa) {
    const iNis = col("nis"), iNama = col("nama"), iKelas = col("kelas"),
          iUser = col("username"), iPass = col("password");
    if ([iNis, iNama, iUser, iPass].some((i) => i < 0)) {
      console.error("Header siswa tidak lengkap. Butuh: nis,nama,kelas,username,password");
      process.exit(2);
    }
    for (let idx = 0; idx < data.length; idx++) {
      const line = idx + 2;
      const r = data[idx];
      const nis = (r[iNis] ?? "").trim();
      const nama = (r[iNama] ?? "").trim();
      const kelasNama = (r[iKelas] ?? "").trim();
      const uname = (r[iUser] ?? "").trim();
      const pass = r[iPass] ?? "";
      if (!nis) errors.push({ line, msg: "NIS wajib diisi." });
      else if (nis.length > 30) errors.push({ line, msg: "NIS maksimal 30 karakter." });
      else if (existingNis.has(nis)) errors.push({ line, msg: `NIS ${nis} sudah ada di database.` });
      else if (seenKeys.has("nis:" + nis)) errors.push({ line, msg: `NIS ${nis} muncul dua kali di file ini.` });
      else seenKeys.add("nis:" + nis);
      const ne = errNama(nama); if (ne) errors.push({ line, msg: ne });
      const ue = errUsername(uname); if (ue) errors.push({ line, msg: ue });
      else if (existingUsernames.has(uname)) errors.push({ line, msg: `Username ${uname} sudah dipakai.` });
      else if (seenUsernames.has(uname)) errors.push({ line, msg: `Username ${uname} muncul dua kali di file ini.` });
      else seenUsernames.add(uname);
      const pe = errPassword(pass); if (pe) errors.push({ line, msg: pe });
      if (kelasNama) {
        const k = db.query("SELECT id FROM kelas WHERE nama = ?").get(kelasNama) as { id: number } | undefined;
        if (!k) errors.push({ line, msg: `Kelas "${kelasNama}" tidak ditemukan. Daftar kelas ada di menu Admin → Kelas.` });
      }
    }
  } else {
    const iNama = col("nama"), iNisAnak = col("nis_anak"), iHub = col("hubungan"),
          iUser = col("username"), iPass = col("password");
    if ([iNama, iNisAnak, iHub, iUser, iPass].some((i) => i < 0)) {
      console.error("Header orang tua tidak lengkap. Butuh: nama,nis_anak,hubungan,username,password");
      process.exit(2);
    }
    for (let idx = 0; idx < data.length; idx++) {
      const line = idx + 2;
      const r = data[idx];
      const nama = (r[iNama] ?? "").trim();
      const nisAnak = (r[iNisAnak] ?? "").trim();
      const hubungan = (r[iHub] ?? "").trim();
      const uname = (r[iUser] ?? "").trim();
      const pass = r[iPass] ?? "";
      const ne = errNama(nama); if (ne) errors.push({ line, msg: ne });
      if (!nisAnak) errors.push({ line, msg: "NIS anak wajib diisi." });
      else {
        const s = db.query("SELECT id FROM siswa WHERE nis = ?").get(nisAnak) as { id: number } | undefined;
        if (!s) errors.push({ line, msg: `Tidak ada siswa dengan NIS ${nisAnak}. Import siswa dulu.` });
      }
      if (!/^(Ayah|Ibu|Wali)$/.test(hubungan)) errors.push({ line, msg: `Hubungan "${hubungan}" tidak valid (harus Ayah/Ibu/Wali).` });
      const ue = errUsername(uname); if (ue) errors.push({ line, msg: ue });
      else if (existingUsernames.has(uname)) errors.push({ line, msg: `Username ${uname} sudah dipakai.` });
      else if (seenUsernames.has(uname)) errors.push({ line, msg: `Username ${uname} muncul dua kali di file ini.` });
      else seenUsernames.add(uname);
      const pe = errPassword(pass); if (pe) errors.push({ line, msg: pe });
    }
  }

  if (errors.length) {
    console.error(`\n❌ Ditemukan ${errors.length} error — tidak ada data disimpan:`);
    for (const e of errors) console.error(`  Baris ${e.line}: ${e.msg}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log(`\n✅ Dry-run: ${data.length} baris valid dan siap diimport.`);
    console.log("   Jalankan tanpa --dry-run untuk benar-benar menyimpan.");
    process.exit(0);
  }

  // ---------- Fase 2: simpan dalam transaksi ----------
  db.exec("BEGIN");
  try {
    if (isSiswa) {
      const iNis = col("nis"), iNama = col("nama"), iKelas = col("kelas"),
            iUser = col("username"), iPass = col("password");
      for (let idx = 0; idx < data.length; idx++) {
        const r = data[idx];
        const nis = (r[iNis] ?? "").trim();
        const nama = (r[iNama] ?? "").trim();
        const kelasNama = (r[iKelas] ?? "").trim();
        const uname = (r[iUser] ?? "").trim();
        const pass = r[iPass] ?? "";
        const k = kelasNama
          ? (db.query("SELECT id FROM kelas WHERE nama = ?").get(kelasNama) as { id: number }).id
          : null;
        const uid = Number(db.run(
          "INSERT INTO users (username, password_hash, nama, role) VALUES (?,?,?,?)",
          [uname, await hashPassword(pass), nama, "siswa"],
        ).lastInsertRowid);
        const sid = Number(db.run(
          "INSERT INTO siswa (user_id, nis, nama, kelas_id) VALUES (?,?,?,?)",
          [uid, nis, nama, k],
        ).lastInsertRowid);
        ensureKehadiranForSiswa(sid, k);
      }
      console.log(`\n✅ ${data.length} siswa berhasil diimport.`);
    } else {
      const iNama = col("nama"), iNisAnak = col("nis_anak"), iHub = col("hubungan"),
            iUser = col("username"), iPass = col("password");
      for (let idx = 0; idx < data.length; idx++) {
        const r = data[idx];
        const nama = (r[iNama] ?? "").trim();
        const nisAnak = (r[iNisAnak] ?? "").trim();
        const hubungan = (r[iHub] ?? "").trim();
        const uname = (r[iUser] ?? "").trim();
        const pass = r[iPass] ?? "";
        const s = db.query("SELECT id FROM siswa WHERE nis = ?").get(nisAnak) as { id: number };
        const uid = Number(db.run(
          "INSERT INTO users (username, password_hash, nama, role) VALUES (?,?,?,?)",
          [uname, await hashPassword(pass), nama, "orang_tua"],
        ).lastInsertRowid);
        db.run(
          "INSERT INTO orang_tua (user_id, siswa_id, nama, hubungan) VALUES (?,?,?,?)",
          [uid, s.id, nama, hubungan],
        );
      }
      console.log(`\n✅ ${data.length} orang tua berhasil diimport.`);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    console.error("\n❌ Gagal menyimpan, transaksi dibatalkan:");
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

await main();
