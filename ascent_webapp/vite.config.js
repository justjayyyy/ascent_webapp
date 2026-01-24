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
          if (id.includes('node_modules')) {
            // CRITICAL: Keep React and all React-dependent libraries in main entry
            // This ensures React is available before any vendor chunks try to use it
            if (id.includes('react') || 
                id.includes('react-dom') || 
                id.includes('react-router') ||
                id.includes('scheduler') ||
                id.includes('@radix-ui') ||  // Radix UI depends on React
                id.includes('recharts')) {   // Recharts depends on React
              // Keep in main entry chunk to ensure React is available
              return undefined;
            }
            
            // Split other vendor chunks that don't directly depend on React
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
