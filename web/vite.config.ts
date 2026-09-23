import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const shared = fileURLToPath(new URL('../supabase/functions/_shared', import.meta.url));

// GitHub Pages can't send headers, so the Content-Security-Policy ships as a <meta> tag.
// Build only: Vite's dev server injects inline scripts that a strict policy would block.
function csp(supabaseUrl: string): Plugin {
  const policy = [
    "default-src 'self'",
    `connect-src 'self' ${supabaseUrl}`,
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_KEY) {
    throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_KEY (see web/.env.example).');
  }
  return {
    base: '/highscores/',
    plugins: [react(), csp(env.VITE_SUPABASE_URL)],
    resolve: { alias: { '@shared': shared } },
    server: { fs: { allow: ['..'] } },
  };
});
