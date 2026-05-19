import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = env.VITE_API_PROXY_TARGET?.trim() || "http://127.0.0.1:3040";

  return {
    server: {
    // true = 0.0.0.0: aceita localhost (IPv4) no Windows; "::" sozinho costuma recusar 127.0.0.1
    host: true,
    // Deixe 3000 livre para o Express (backend/). Front em :3080.
    port: 3081,
    proxy: {
      // Com VITE_API_URL=/ no .env.local, o browser chama /api/* no Vite e o dev server encaminha para o Express.
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
    hmr: {
      overlay: false,
    },
  },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (/node_modules\/(\.pnpm\/)?(react|react-dom|react-router|react-router-dom)(@|\/)/.test(id)) {
              return "react-vendor";
            }
            if (id.includes("@tanstack/react-query")) return "query-vendor";
            if (id.includes("lucide-react")) return "icons-vendor";
            if (id.includes("react-hook-form") || id.includes("@hookform/resolvers")) return "forms-vendor";
            if (id.includes("jspdf")) return "pdf-jspdf";
            if (id.includes("html2canvas") || id.includes("dompurify")) return "pdf-render";
            if (id.includes("@supabase")) return "supabase-vendor";
            if (id.includes("@radix-ui")) return "ui-vendor";
            if (id.includes("recharts")) return "charts-vendor";
            return undefined;
          },
        },
      },
    },
  };
});
