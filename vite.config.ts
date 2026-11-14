import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schoolStage = process.env.SCHOOL_STAGE ?? "moyen";

if (schoolStage !== "moyen" && schoolStage !== "lycee") {
  throw new Error(`Invalid SCHOOL_STAGE "${schoolStage}". Expected "moyen" or "lycee".`);
}

export default defineConfig({
  define: {
    __SCHOOL_STAGE__: JSON.stringify(schoolStage),
  },
  root: "client",
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
  },
  server: {
    port: parseInt(process.env.PORT || "5000"),
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        secure: false,
      },
      // Proxy the Socket.IO agent namespace so the Electron agent can reach it
      // through the Vite dev server (port 5000 → external :80).
      "/agent-socket": {
        target: "http://localhost:8080",
        changeOrigin: true,
        secure: false,
        ws: true, // upgrade WebSocket connections
      },
    },
  },
});
