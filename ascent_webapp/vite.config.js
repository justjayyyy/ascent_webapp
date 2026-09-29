import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
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
            name: 'New note',
            short_name: 'New note',
            description: 'Jot something down',
            url: '/Notes?new=1',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'New checklist',
            short_name: 'Checklist',
            url: '/Notes?new=1&type=checklist',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Notes',
            short_name: 'Notes',
            url: '/Notes',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
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
        globIgnores: ['**/logo-dark.png', '**/logo-light.png'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
    // Disable source maps in production for smaller bundle size
    sourcemap: false,
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
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
});
