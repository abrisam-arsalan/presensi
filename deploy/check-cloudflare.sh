#!/usr/bin/env bash
# Cek status Cloudflare Tunnel (cloudflared) di server Ubuntu

set -e

echo "=== Cek Cloudflare Tunnel (cloudflared) ==="
echo ""

# 1. Apakah binary cloudflared ada?
echo "[1] Lokasi binary cloudflared:"
if command -v cloudflared &> /dev/null; then
    which cloudflared
else
    echo "    ❌ cloudflared TIDAK ditemukan di PATH"
    echo "    Install dengan: curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared"
    exit 1
fi

# 2. Versi cloudflared
echo ""
echo "[2] Versi cloudflared:"
cloudflared --version

# 3. Status service systemd
echo ""
echo "[3] Status service cloudflared:"
if systemctl is-active --quiet cloudflared; then
    echo "    ✅ Service cloudflared AKTIF"
else
    echo "    ❌ Service cloudflared TIDAK AKTIF"
    echo "    Coba jalankan: sudo systemctl start cloudflared"
fi

if systemctl is-enabled --quiet cloudflared 2>/dev/null; then
    echo "    ✅ Service cloudflared enable saat boot"
else
    echo "    ⚠️  Service cloudflared BELUM enable saat boot"
    echo "    Jalankan: sudo systemctl enable cloudflared"
fi

# 4. Daftar tunnel
echo ""
echo "[4] Daftar tunnel:"
cloudflared tunnel list || true

# 5. Konfigurasi tunnel
echo ""
echo "[5] File konfigurasi cloudflared:"
for f in /etc/cloudflared/config.yml ~/.cloudflared/config.yml /root/.cloudflared/config.yml; do
    if [ -f "$f" ]; then
        echo "    ✅ Ditemukan: $f"
        echo "    Isi:"
        sed 's/^/        /' "$f"

        echo ""
        if grep -q "presensi.smp5tegal.sch.id" "$f"; then
            echo "    ✅ Hostname presensi.smp5tegal.sch.id SUDAH ada di ingress"
        else
            echo "    ❌ Hostname presensi.smp5tegal.sch.id BELUM ada di ingress"
        fi
    fi
done

# 6. Log terakhir
echo ""
echo "[6] Log terakhir cloudflared (20 baris):"
sudo journalctl -u cloudflared --no-pager -n 20 || true

echo ""
echo "=== Selesai ==="
