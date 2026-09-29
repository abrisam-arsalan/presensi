import { join } from "node:path";
import { initSchema, seedIfEmpty } from "./db";
import { dispatch } from "./router";
import { registerAuth } from "./routes/auth";
import { registerAdmin } from "./routes/admin";
import { registerKepala } from "./routes/kepala";
import { registerGuru } from "./routes/guru";
import { registerSiswa } from "./routes/siswa";
import { registerOrtu } from "./routes/ortu";
import { APP_NAME } from "./ui";

initSchema();
await seedIfEmpty();

registerAuth();
registerAdmin();
registerKepala();
registerGuru();
registerSiswa();
registerOrtu();

const publicDir = join(import.meta.dir, "..", "public");

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  hostname: process.env.HOST ?? "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);

    // Root → redirect sesuai role (atau login)
    if (url.pathname === "/") {
      return Response.redirect(new URL("/login", url), 302);
    }

    // Static assets
    if (url.pathname.startsWith("/assets/")) {
      const rel = url.pathname.slice("/assets/".length);
      if (rel.includes("..")) return new Response("Bad Request", { status: 400 });
      const file = Bun.file(join(publicDir, rel));
      if (await file.exists()) {
        return new Response(file, { headers: { "Cache-Control": "no-store" } });
      }
      return new Response("Not Found", { status: 404 });
    }

    return dispatch(req);
  },
});

console.log("");
console.log(`✅ ${APP_NAME} berjalan di http://localhost:${server.port}`);
console.log("   Login admin: admin / admin123");
