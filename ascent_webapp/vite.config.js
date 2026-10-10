import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Readable stack traces in Sentry: with these set (Vercel build settings), source maps are uploaded to
// Sentry and then deleted, so they are never served to browsers
const uploadSourceMaps = !!(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT)

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  define: {
    // Ties error reports to the deployed commit
    'import.meta.env.VITE_RELEASE': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || ''),
  },
  plugins: [
    react({
      // Ensure React is properly handled
      jsxRuntime: 'automatic',
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Ascent',
        short_name: 'Ascent',
        description: 'Ascent - Personal Finance Tracker',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        categories: ['finance', 'productivity'],
        // Long-press the installed icon for quick actions
        shortcuts: [
          {
            name: 'Add expense',
            short_name: 'Expense',
            description: 'Log a purchase',
            url: '/Expenses?new=1',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Add income',
            short_name: 'Income',
            url: '/Income?new=1',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Monthly recap',
            short_name: 'Recap',
            description: 'Your month in money',
            url: '/Dashboard?recap=1',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'New note',
            short_name: 'Note',
            description: 'Jot something down',
            url: '/Notes?new=1',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        // Opening a shortcut or link while the app is already running reuses that window
        launch_handler: { client_mode: ['navigate-existing', 'auto'] },
        // Appear in the system share sheet: share text or a link into a new note
        share_target: {
          action: '/Notes',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Never serve the SPA shell for API calls
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The PDF reader (pdf.js) loads only when someone imports a PDF into a note; not worth precaching for everyone
        globIgnores: ['**/logo-dark.png', '**/logo-light.png', '**/assets/pdf-*.js', '**/assets/pdf.worker*'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // Adds the notification-tap handler used by note reminders
        importScripts: ['sw-notify.js', 'sw-push.js'],
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
    uploadSourceMaps && sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: process.env.VERCEL_GIT_COMMIT_SHA || undefined },
      sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      telemetry: false,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
      // Ensure React is always resolved from the same location
      'react': path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
    },
    // CRITICAL: Ensure React is resolved as a singleton to prevent duplicate instances
    dedupe: ['react', 'react-dom'],
  },
  build: {
    // Optimize build output
    rollupOptions: {
      output: {
        // Only split out ECharts (large, and it has no React dependency). Hand-rolled
        // vendor groups that mixed React-dependent packages caused circular chunks and a
        // blank production page ("Cannot set properties of undefined (setting 'Children')").
        manualChunks: (id) => {
          if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) {
            return 'echarts-vendor';
          }
        },
      },
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
    // Source maps only for Sentry (uploaded, then removed from the build); never served
    sourcemap: uploadSourceMaps ? 'hidden' : false,
    // Minify with esbuild (built-in, faster than terser)
    minify: 'esbuild',
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Use modern target for better optimization
    target: 'es2015',
    // Reduce chunk size warnings
    reportCompressedSize: false,
    // Ensure proper module format
    modulePreload: {
      polyfill: false,
    },
  },
  optimizeDeps: {
    // Pre-bundle React to ensure it's available and deduplicated
    include: [
      'react', 'react-dom', 'react/jsx-runtime',
      // Bundle ECharts' entry points together up front so they share one copy of core
      'echarts/core', 'echarts/charts', 'echarts/components', 'echarts/features', 'echarts/renderers', 'zrender',
    ],
  },
  server: {
    watch: {
      // OneDrive locks these generated folders, which crashes the watcher (EBUSY)
      ignored: ['**/playwright-report/**', '**/test-results/**'],
    },
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
});
