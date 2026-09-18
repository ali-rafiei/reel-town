import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/reel-town/' : '/',
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [vinext()],
  server: { watch: { usePolling: true } },
});
