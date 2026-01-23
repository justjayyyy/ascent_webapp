import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  plugins: [
    react({
      // Ensure React is properly handled
      jsxRuntime: 'automatic',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // CRITICAL: Ensure React is resolved as a singleton to prevent duplicate instances
    dedupe: ['react', 'react-dom'],
  },
  build: {
    // Optimize build output
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Split vendor chunks for better caching
          if (id.includes('node_modules')) {
            // CRITICAL: React and React-DOM MUST stay together in the same chunk
            // Match react-dom first (most specific)
            if (id.includes('react-dom')) {
              return 'react-vendor';
            }
            // Match react package root specifically (use regex for better matching)
            // This matches /react/ or \react\ but not @radix-ui/react-*
            if (/[\\/]react[\\/]/.test(id) && !id.includes('@radix-ui')) {
              return 'react-vendor';
            }
            // React Router should also be with React
            if (id.includes('react-router')) {
              return 'react-vendor';
            }
            // Other vendor chunks
            if (id.includes('@radix-ui')) {
              return 'ui-vendor';
            }
            if (id.includes('recharts')) {
              return 'chart-vendor';
            }
            if (id.includes('@tanstack/react-query')) {
              return 'query-vendor';
            }
            // Other large dependencies
            if (id.includes('framer-motion') || id.includes('three')) {
              return 'animation-vendor';
            }
            // Default vendor chunk
            return 'vendor';
          }
        },
      },
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
    // Enable source maps temporarily for debugging
    sourcemap: true,
    // Minify with esbuild (built-in, faster than terser)
    minify: 'esbuild',
  },
  optimizeDeps: {
    // Pre-bundle React to ensure it's available and deduplicated
    include: ['react', 'react-dom', 'react/jsx-runtime'],
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
