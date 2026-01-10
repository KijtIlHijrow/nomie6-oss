import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'
// import loadVersion from 'vite-plugin-package-version'
import manifest from './manifest'
import path from 'path'
import { fileURLToPath } from 'url'
import svelteSVG from 'vite-plugin-svelte-svg'
import rollupPluginsSvelte from 'rollup-plugin-svelte-svg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  optimizeDeps: {
    allowNodeBuiltins: ['pouchdb-browser', 'pouchdb-utils'],
    exclude: ['canvas-confetti', 'tributejs', 'svelte-navigator'],
  },
  build: {
    rollupOptions: {
      // external: ['aws-sdk','aws-sdk/clients/S3'],
      output: {
        // globals: {
        //   'aws-sdk': 'AWS',
        //   'S3': 'aws-sdk/clients/S3'
        // },
      },
      plugins: [
        rollupPluginsSvelte,
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    svelte({

    }),
    svelteSVG({
      svgoConfig: {}, // See https://github.com/svg/svgo#configuration
    }),

    VitePWA({
      manifest: manifest,
      maximumFileSizeToCacheInBytes: 10 * 1024 ** 2, // 10 MB
    }),
  ],
  define:  {
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(process.env.npm_package_version)
  },
  server: {
    host: '0.0.0.0',
    port: 5001,
    strictPort: true,
    watch: {
      usePolling: true,
    },
  },
})
