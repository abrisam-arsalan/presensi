// Util kecil: escape HTML, tanggal, nama hari, label role, dll.

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function nl2br(s: string): string {
  return esc(s).replace(/\r?\n/g, "<br>");
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function timeNow(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
export const DAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function dayName(n: number): string {
  return DAY_NAMES[n] ?? String(n);
}

export const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function formatDate(s: string): string {
  if (!s) return "-";
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function nowSql(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

export function formatDateTime(s: string): string {
  if (!s) return "-";
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }) + " WIB";
}

export function roleLabel(role: string): string {
  const map: Record<string, string> = {
    admin: "Administrator",
    kepala_sekolah: "Kepala Sekolah",
    guru: "Guru",
    siswa: "Siswa",
    orang_tua: "Orang Tua",
  };
  return map[role] ?? role;
}

export function homeFor(role: string): string {
  const map: Record<string, string> = {
    admin: "/admin",
    kepala_sekolah: "/kepala",
    guru: "/guru",
    siswa: "/siswa",
    orang_tua: "/orangtua",
  };
  return map[role] ?? "/login";
}

// Hitung tanggal kemunculan berikutnya dari sebuah jadwal (hari + jam_mulai).
export function nextOccurrence(hari: number, jamMulai: string): { date: string; isToday: boolean } {
  const now = new Date();
  const todayDow = now.getDay();
  let diff = (hari - todayDow + 7) % 7;
  if (diff === 0) {
    const [h, m] = jamMulai.split(":").map(Number);
    if (now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)) {
      diff = 7; // sudah lewat hari ini, geser minggu depan
    }
  }
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  return { date: toDateStr(d), isToday: diff === 0 };
}
