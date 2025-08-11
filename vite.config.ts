import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        // React 앱의 진입점
        main: resolve(__dirname, "index.html"),
        // 백그라운드 스크립트
        background: resolve(__dirname, "background.js"),
        // 컨텐츠 스크립트
        content: resolve(__dirname, "content.js"),
      },
      output: {
        // 각 파일이 고유한 이름을 갖도록 설정
        entryFileNames: "[name].js",
        // 청크 파일 이름 설정 (필요 시)
        chunkFileNames: "chunks/[name].js",
        // 에셋 파일 이름 설정 (CSS, 이미지 등)
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
});
