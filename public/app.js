// Aplikasi kecil untuk interaksi client-side (tanpa framework).

// 1) Konfirmasi hapus / aksi berbahaya
document.addEventListener("submit", (e) => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement)) return;
  const trigger = form.querySelector("[data-confirm]");
  const msg = trigger?.getAttribute("data-confirm");
  if (msg && !window.confirm(msg)) {
    e.preventDefault();
  }
});

// 2) Tombol status kehadiran (Hadir / Sakit / Izin / Alpa)
function setStudentStatus(group, status) {
  const input = group.querySelector('input[type="hidden"]');
  if (input) input.value = status;
  group.querySelectorAll(".status-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-status") === status);
  });
}

function setAllStatus(status) {
  document.querySelectorAll(".status-btns").forEach((group) => {
    setStudentStatus(group, status);
  });
}

document.addEventListener("click", (e) => {
  const allBtn = e.target.closest("[data-set-all]");
  if (allBtn) {
    setAllStatus(allBtn.getAttribute("data-set-all"));
    return;
  }
  const statusBtn = e.target.closest(".status-btn");
  if (statusBtn) {
    const group = statusBtn.closest(".status-btns");
    if (group) setStudentStatus(group, statusBtn.getAttribute("data-status"));
  }
});

// 3) CSRF token: inject hidden _csrf into all POST forms (kecuali login)
document.addEventListener("DOMContentLoaded", () => {
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (!meta) return;
  const token = meta.getAttribute("content");
  if (!token) return;
  document.querySelectorAll('form[method="post"]').forEach((form) => {
    if (form.querySelector('input[name="_csrf"]')) return;
    if (form.getAttribute("action") === "/login") return;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "_csrf";
    input.value = token;
    form.appendChild(input);
  });
});
