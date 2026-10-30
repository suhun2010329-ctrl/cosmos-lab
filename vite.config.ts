import { resolve } from "node:path";
import { defineConfig } from "vite";

// 페이지 네 개(허브 + 시뮬레이션 세 개)를 한 번에 빌드하는 멀티 페이지 설정.
// base를 "./"로 두면 GitHub Pages의 하위 경로(/저장소이름/)에서도 그대로 작동한다.
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    // three.js r128은 통째로 묶여 3D 페이지 묶음이 650 kB쯤 됨 (gzip 177 kB)
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        hub: resolve(import.meta.dirname, "index.html"),
        fourd: resolve(import.meta.dirname, "fourd/index.html"),
        bigbang: resolve(import.meta.dirname, "bigbang/index.html"),
        universe: resolve(import.meta.dirname, "universe/index.html"),
        atlas: resolve(import.meta.dirname, "atlas/index.html"),
      },
    },
  },
  worker: { format: "es" },
});
