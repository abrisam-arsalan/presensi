# Panglima App — Rekap Kehadiran Siswa

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

### 4. Tambah vhost Nginx untuk presensi

Server sudah memiliki setup Cloudflare Tunnel untuk `ujian` dan `mpi`. Nginx di server listen port 80 dan memilah traffic berdasarkan `server_name`. Tambahkan vhost presensi:

```bash
sudo cp deploy/nginx-presensi.conf /etc/nginx/sites-available/presensi
sudo ln -s /etc/nginx/sites-available/presensi /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

> Tidak perlu sertifikat SSL di server karena enkripsi diurus Cloudflare Tunnel.

### 5. Tambah hostname presensi ke Cloudflare Tunnel

Edit konfigurasi tunnel yang sama dengan `ujian` dan `mpi` (biasanya tunnel `85966569`):

```bash
sudo nano /etc/cloudflared/config.yml
```

Tambahkan ingress `presensi` di bawah `ujian` dan `mpi`:

```yaml
  - hostname: ujian.smp5tegal.sch.id
    service: http://localhost:80
  - hostname: mpi.smp5tegal.sch.id
    service: http://localhost:80
  - hostname: presensi.smp5tegal.sch.id
    service: http://localhost:80
```

> Perhatikan indentasi 2 spasi. Salah indentasi akan membuat cloudflared gagal start.

Restart tunnel:

```bash
sudo systemctl restart cloudflared
sudo systemctl status cloudflared
```

Tunggu beberapa saat, lalu akses `https://presensi.smp5tegal.sch.id`.

> **Catatan DNS:** Jika `nslookup presensi.smp5tegal.sch.id` masih NXDOMAIN setelah beberapa menit, pastikan nameserver domain di registrar sudah mengarah ke Cloudflare (`darl.ns.cloudflare.com`, `ryleigh.ns.cloudflare.com`), bukan ke Hostinger (`dns-parking.com`).

### 5a. Cek Cloudflare Tunnel yang sudah terinstal

Jika server sudah pernah di-setup Cloudflare Tunnel, jalankan script pengecekan:

```bash
cd /var/www/presensi
chmod +x deploy/check-cloudflare.sh
sudo ./deploy/check-cloudflare.sh
```

Script tersebut akan mengecek:
1. Apakah binary `cloudflared` tersedia di PATH.
2. Versi `cloudflared`.
3. Status service `cloudflared` (aktif/tidak, enable saat boot/tidak).
4. Daftar tunnel yang terdaftar.
5. Lokasi & isi file konfigurasi tunnel.
6. Log terakhir service cloudflared.

Atau cek manual satu per satu:

```bash
# Cek versi & lokasi binary
which cloudflared
cloudflared --version

# Cek status service
sudo systemctl status cloudflared

# Cek daftar tunnel
cloudflared tunnel list

# Cek konfigurasi
sudo cat /etc/cloudflared/config.yml
# atau
sudo cat ~/.cloudflared/config.yml

# Cek log terakhir
sudo journalctl -u cloudflared --no-pager -n 50
```

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
