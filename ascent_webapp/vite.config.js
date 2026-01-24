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
        manualChunks: (id) => {
          // Split vendor chunks for better caching
          if (id.includes('node_modules')) {
            // CRITICAL: Keep React in the entry chunk or a dedicated chunk that loads first
            // Don't split React - it must be available before other chunks
            if (id.includes('react-dom') || 
                /[\\/]react[\\/]/.test(id) || 
                id.includes('react-router')) {
              // Put React in a dedicated chunk that will be loaded first
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
            // Split lucide-react into its own chunk (large icon library)
            if (id.includes('lucide-react')) {
              return 'icons-vendor';
            }
            // Split heavy libraries
            if (id.includes('lodash') || id.includes('moment') || id.includes('date-fns')) {
              return 'utils-vendor';
            }
            // Default vendor chunk
            return 'vendor';
          }
        },
      },
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
    // Disable source maps in production for smaller bundle size
    sourcemap: process.env.NODE_ENV === 'development',
    // Minify with esbuild (built-in, faster than terser)
    minify: 'esbuild',
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Optimize chunk size
    target: 'esnext',
    // Reduce chunk size warnings
    reportCompressedSize: false,
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
