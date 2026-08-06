import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:4000';

/**
 * `getUserMedia` and `getDisplayMedia` are gated behind a secure context. That is
 * satisfied by `localhost`, but not by the LAN address a phone or a second
 * machine would use — so dev serves over TLS whenever the generated certificate
 * is present.
 *
 * Set `VITE_HTTP=1` to serve plain HTTP instead. On localhost that is still a
 * secure context, so media works with no certificate warning to click past; it
 * is only LAN and phone testing that need the TLS path.
 */
const certDir = path.resolve(__dirname, '../../infra/certs');
const certPath = path.join(certDir, 'dev-cert.pem');
const keyPath = path.join(certDir, 'dev-key.pem');
const https =
  process.env.VITE_HTTP !== '1' && fs.existsSync(certPath) && fs.existsSync(keyPath)
    ? { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) }
    : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Bind to 0.0.0.0 so a phone on the same Wi-Fi can load the app.
    host: true,
    https,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/ws': { target: API_TARGET.replace(/^http/, 'ws'), ws: true },
    },
  },
  preview: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          mediasoup: ['mediasoup-client'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
