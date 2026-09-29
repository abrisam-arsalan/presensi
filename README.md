# SekolahApp — Rekap Kehadiran Siswa

Aplikasi sekolah berbasis web untuk merekap kehadiran siswa, lengkap dengan
pengelolaan jadwal, materi pelajaran, dan catatan kelas. **Mobile-friendly**
(optimasi layar ponsel) untuk semua peran kecuali Admin.

Dibangun **tanpa dependensi eksternal** — cukup [Bun](https://bun.sh) saja.
Server HTTP memakai `Bun.serve`, database memakai `bun:sqlite`, dan password
memakai `Bun.password` (bcrypt).

## Peran & Hak Akses

| Peran | Kemampuan |
| --- | --- |
| **Admin** | Mengelola jadwal pelajaran, data kelas, mata pelajaran, guru, siswa, orang tua, user, dan melihat rekap kehadiran (full CRUD). Orientasi desktop. |
| **Kepala Sekolah** | Monitoring saja (read-only): dashboard, jadwal, rekap kehadiran, data sekolah. Tanpa akses edit. |
| **Guru Mata Pelajaran** | Dashboard menampilkan **jadwal mengajar terdekat**. Mengelola absensi sesuai jam mengajarnya (default semua siswa **Hadir**), mengisi **materi pelajaran** dan **catatan kelas**. |
| **Siswa** | Melihat kehadiran sendiri dan materi pelajaran. |
| **Orang Tua** | Melihat kehadiran dan materi pelajaran anaknya. |

## Cara Menjalankan

Prasyarat: [Bun](https://bun.sh) terinstal (versi 1.x).

```bash
cd sekolah-app
bun run src/index.ts
```

Lalu buka http://localhost:3000

> Ingin ganti port? Jalankan `PORT=8080 bun run src/index.ts` (Windows:
> `$env:PORT=8080; bun run src/index.ts`).

Database SQLite (`data/sekolah.db`) dibuat otomatis beserta **data awal (seed)**
saat pertama kali dijalankan. Untuk memulai ulang dari data awal, hapus folder
`data/` lalu jalankan lagi.

### Akun demo

| Peran | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `admin123` |
| Kepala Sekolah | `kepsek` | `kepsek123` |
| Guru | `guru.budi` | `guru123` |
| Guru | `guru.siti` | `guru123` |
| Siswa | `siswa.andi` | `siswa123` |
| Orang Tua | `orangtua.surya` | `ortu123` |

## Alur Penggunaan Utama

1. **Admin** login → buat/atur kelas, mata pelajaran, guru, siswa, orang tua, dan jadwal.
2. **Guru** login → di dashboard muncul **jadwal mengajar terdekat** → klik **Buka Absensi**
   → semua siswa kelas tersebut otomatis **Hadir** → ubah hanya yang sakit/izin/alpa
   → isi **materi** dan **catatan kelas** → **Simpan** (atau *Simpan & Tandai Selesai*).
3. **Siswa / Orang Tua** login → lihat ringkasan & riwayat kehadiran serta materi.
4. **Kepala Sekolah** login → pantau semuanya (dashboard, jadwal, rekap) tanpa bisa mengubah.

## Struktur Proyek

```
sekolah-app/
├── package.json
├── public/
│   ├── style.css        # UI mobile-first
│   └── app.js           # interaksi client (konfirmasi, "semua hadir", dsb.)
├── scripts/
│   └── smoke.ts         # smoke test in-process (22 pemeriksaan)
└── src/
    ├── index.ts         # entry: Bun.serve + static + routing
    ├── router.ts        # router sederhana (method + path pattern)
    ├── db.ts            # skema SQLite + seed data awal
    ├── auth.ts          # session (cookie) + hash password
    ├── http.ts          # helper request/response
    ├── ui.ts            # layout HTML + komponen UI
    ├── util.ts          # util tanggal, escape, label
    ├── guard.ts         # guard role
    └── routes/
        ├── auth.ts      # login / logout
        ├── admin.ts     # CRUD admin
        ├── kepala.ts    # monitoring kepala sekolah (read-only)
        ├── guru.ts      # jadwal terdekat + absensi + materi
        ├── siswa.ts     # lihat kehadiran & materi
        └── ortu.ts      # lihat kehadiran & materi anak
```

## Menjalankan Smoke Test

```bash
bun run scripts/smoke.ts
```

## Deployment ke Ubuntu + Cloudflare

Repositori target: `https://github.com/abrisam-arsalan/presensi`  
Domain: `presensi.smp5tegal.sch.id`

### 1. Push dari Windows (PowerShell) ke GitHub

Buka PowerShell di folder `sekolah-app`:

```powershell
git init
git remote add origin https://github.com/abrisam-arsalan/presensi.git
git add .
git commit -m "init: aplikasi presensi smp"
git push -u origin main
```

> Folder `data/` sudah di-exclude via `.gitignore` — jangan pernah commit file database.
>
> Di PowerShell, environment variable ditulis dengan `$env:VAR`, misal:
> ```powershell
> $env:PORT = 8080
> bun run src/index.ts
> ```

### 2. Setup server Ubuntu

SSH ke server, lalu:

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Clone repo
sudo mkdir -p /var/www
sudo git clone https://github.com/abrisam-arsalan/presensi.git /var/www/presensi
sudo chown -R $USER:$USER /var/www/presensi
cd /var/www/presensi

# Jalankan sekali untuk membuat database awal
bun run src/index.ts
# Tekan Ctrl+C setelah database & seed terbuat
```

### 3. Jalankan sebagai service (systemd)

Salin `deploy/sekolah-app.service` ke `/etc/systemd/system/` dan sesuaikan `User`, `Group`, serta path `ExecStart`.

```bash
sudo cp deploy/sekolah-app.service /etc/systemd/system/
# Edit path Bun & user sesuai server:
sudo nano /etc/systemd/system/sekolah-app.service

sudo systemctl daemon-reload
sudo systemctl enable sekolah-app
sudo systemctl start sekolah-app
sudo systemctl status sekolah-app
```

Aplikasi akan berjalan di `127.0.0.1:3000`.

### 4. Reverse proxy dengan Nginx

```bash
sudo apt update
sudo apt install nginx
sudo cp deploy/nginx-presensi.conf /etc/nginx/sites-available/presensi
sudo ln -s /etc/nginx/sites-available/presensi /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 5. Konfigurasi Cloudflare

1. Login Cloudflare → pilih domain `smp5tegal.sch.id`.
2. Tambahkan **DNS record**:
   - Type: `A`
   - Name: `presensi`
   - Target: IP publik server Ubuntu
   - Proxy status: Aktif (orange cloud)
3. Menu **SSL/TLS → Overview**:
   - Pilih mode **Full (strict)** jika di server sudah install sertifikat origin (misal Cloudflare Origin CA).
   - Atau pilih **Full** jika Nginx hanya listen HTTP port 80 (tidak disarankan untuk produksi jangka panjang).
4. Aktifkan **Always Use HTTPS**.
5. Tunggu propagasi DNS, lalu akses `https://presensi.smp5tegal.sch.id`.

> **Tips:** Jika tidak ingin repot dengan Nginx & sertifikat, gunakan **Cloudflare Tunnel** (`cloudflared`) agar server tidak perlu membuka port 80/443 sama sekali.

### 6. Backup database

Database SQLite berada di `data/sekolah.db`. Backup berkala:

```bash
# Contoh backup harian via cron
0 2 * * * cp /var/www/presensi/data/sekolah.db /backup/presensi-sekolah-$(date +\%Y\%m\%d).db
```

### 7. Update aplikasi

```bash
cd /var/www/presensi
git pull origin main
sudo systemctl restart sekolah-app
```

## Catatan Teknis

- Session memakai cookie `HttpOnly` + token acak (UUID) yang disimpan di tabel `sessions`.
- Password di-hash dengan bcrypt via `Bun.password`.
- Data yang ditampilkan di-escape untuk mencegah XSS.
- Konvensi hari: `0=Minggu … 6=Sabtu` (mengikuti `Date.getDay()`).
- Sebuah "sesi mengajar" diidentifikasi oleh pasangan `(jadwal_id, tanggal)`; saat pertama
  dibuka, catatan kehadiran untuk semua siswa di kelas itu dibuat otomatis berstatus **Hadir**.
