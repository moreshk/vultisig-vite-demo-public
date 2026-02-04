import { copyFileSync, mkdirSync, existsSync, watch } from 'fs'
import path from 'path'
import { resolve } from 'path'
import type { Plugin, ViteDevServer } from 'vite'
import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import wasm from 'vite-plugin-wasm'

// Plugin to resolve vite-plugin-node-polyfills shim imports from the SDK
function resolvePolyfillShims(): Plugin {
  return {
    name: 'resolve-polyfill-shims',
    resolveId(id) {
      if (id === 'vite-plugin-node-polyfills/shims/buffer') {
        return { id: '\0polyfill-buffer', external: false }
      }
      if (id === 'vite-plugin-node-polyfills/shims/process') {
        return { id: '\0polyfill-process', external: false }
      }
      if (id === 'vite-plugin-node-polyfills/shims/global') {
        return { id: '\0polyfill-global', external: false }
      }
      return null
    },
    load(id) {
      if (id === '\0polyfill-buffer') {
        return 'import { Buffer } from "buffer"; export { Buffer }; export default Buffer;'
      }
      if (id === '\0polyfill-process') {
        return 'import process from "process/browser"; export { process }; export default process;'
      }
      if (id === '\0polyfill-global') {
        return 'export default globalThis;'
      }
      return null
    },
  }
}

// Copy WASM files to Vite deps directory
function copyWasmToDeps(): void {
  const sdkLibPath = path.resolve(__dirname, 'node_modules/@vultisig/sdk/dist/lib')
  const walletCoreLibPath = path.resolve(__dirname, 'node_modules/@trustwallet/wallet-core/dist/lib')
  const sevenZipPath = path.resolve(__dirname, 'node_modules/7z-wasm')
  const viteDepsPath = path.resolve(__dirname, 'node_modules/.vite/deps')

  try {
    mkdirSync(viteDepsPath, { recursive: true })

    // Copy DKLS WASM
    if (existsSync(path.join(sdkLibPath, 'dkls/vs_wasm_bg.wasm'))) {
      copyFileSync(
        path.join(sdkLibPath, 'dkls/vs_wasm_bg.wasm'),
        path.join(viteDepsPath, 'vs_wasm_bg.wasm')
      )
    }

    // Copy Schnorr WASM
    if (existsSync(path.join(sdkLibPath, 'schnorr/vs_schnorr_wasm_bg.wasm'))) {
      copyFileSync(
        path.join(sdkLibPath, 'schnorr/vs_schnorr_wasm_bg.wasm'),
        path.join(viteDepsPath, 'vs_schnorr_wasm_bg.wasm')
      )
    }

    // Copy WalletCore WASM
    if (existsSync(path.join(walletCoreLibPath, 'wallet-core.wasm'))) {
      copyFileSync(
        path.join(walletCoreLibPath, 'wallet-core.wasm'),
        path.join(viteDepsPath, 'wallet-core.wasm')
      )
    }

    // Copy 7z-wasm
    if (existsSync(path.join(sevenZipPath, '7zz.wasm'))) {
      copyFileSync(
        path.join(sevenZipPath, '7zz.wasm'),
        path.join(viteDepsPath, '7zz.wasm')
      )
    }

    console.log('✅ Copied WASM files to .vite/deps/')
  } catch (error) {
    console.error('⚠️ Failed to copy WASM files:', error)
  }
}

// Plugin to copy WASM files after dependency optimization
function copyWasmFilesPlugin(): Plugin {
  let watcher: ReturnType<typeof watch> | null = null

  return {
    name: 'copy-wasm-files',
    buildStart() {
      // Copy on build start
      copyWasmToDeps()
    },
    configureServer(server: ViteDevServer) {
      // Copy immediately when server starts
      copyWasmToDeps()

      // Also watch for .vite/deps being recreated (happens on dep changes)
      const depsPath = path.resolve(__dirname, 'node_modules/.vite')
      if (existsSync(depsPath)) {
        watcher = watch(depsPath, { recursive: false }, (event, filename) => {
          if (filename === 'deps' || filename === 'deps_temp') {
            // Small delay to let Vite finish
            setTimeout(copyWasmToDeps, 500)
          }
        })
      }
    },
    closeBundle() {
      watcher?.close()
    },
  }
}

// Also copy WASM to public for fallback
function copyWasmToPublic(): Plugin {
  return {
    name: 'copy-wasm-to-public',
    buildStart() {
      const sdkLibPath = path.resolve(__dirname, 'node_modules/@vultisig/sdk/dist/lib')
      const walletCoreLibPath = path.resolve(__dirname, 'node_modules/@trustwallet/wallet-core/dist/lib')
      const sevenZipPath = path.resolve(__dirname, 'node_modules/7z-wasm')
      const publicPath = path.resolve(__dirname, 'public')

      try {
        mkdirSync(path.join(publicPath, 'lib/dkls'), { recursive: true })
        mkdirSync(path.join(publicPath, 'lib/schnorr'), { recursive: true })
        mkdirSync(path.join(publicPath, '7z-wasm'), { recursive: true })

        // Copy DKLS WASM files
        if (existsSync(path.join(sdkLibPath, 'dkls/vs_wasm_bg.wasm'))) {
          copyFileSync(
            path.join(sdkLibPath, 'dkls/vs_wasm_bg.wasm'),
            path.join(publicPath, 'lib/dkls/vs_wasm_bg.wasm')
          )
          copyFileSync(
            path.join(sdkLibPath, 'dkls/vs_wasm.js'),
            path.join(publicPath, 'lib/dkls/vs_wasm.js')
          )
        }

        // Copy Schnorr WASM files
        if (existsSync(path.join(sdkLibPath, 'schnorr/vs_schnorr_wasm_bg.wasm'))) {
          copyFileSync(
            path.join(sdkLibPath, 'schnorr/vs_schnorr_wasm_bg.wasm'),
            path.join(publicPath, 'lib/schnorr/vs_schnorr_wasm_bg.wasm')
          )
          copyFileSync(
            path.join(sdkLibPath, 'schnorr/vs_schnorr_wasm.js'),
            path.join(publicPath, 'lib/schnorr/vs_schnorr_wasm.js')
          )
        }

        // Copy WalletCore WASM files
        if (existsSync(path.join(walletCoreLibPath, 'wallet-core.wasm'))) {
          copyFileSync(
            path.join(walletCoreLibPath, 'wallet-core.wasm'),
            path.join(publicPath, 'wallet-core.wasm')
          )
          copyFileSync(
            path.join(walletCoreLibPath, 'wallet-core.js'),
            path.join(publicPath, 'wallet-core.js')
          )
        }

        // Copy 7z-wasm files
        if (existsSync(path.join(sevenZipPath, '7zz.wasm'))) {
          copyFileSync(
            path.join(sevenZipPath, '7zz.wasm'),
            path.join(publicPath, '7z-wasm/7zz.wasm')
          )
        }

        console.log('✅ Copied WASM files to public/')
      } catch (error) {
        console.error('⚠️ Failed to copy some WASM files to public:', error)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    wasm(),
    resolvePolyfillShims(),
    nodePolyfills({
      exclude: ['fs'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
    copyWasmFilesPlugin(),
    copyWasmToPublic(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
      buffer: 'buffer',
      util: 'util',
      path: 'path-browserify',
      events: 'events',
      'node-fetch': 'isomorphic-fetch',
    },
    // Ensure browser exports are preferred
    conditions: ['browser', 'import', 'module', 'default'],
  },
  optimizeDeps: {
    include: ['buffer', 'process', 'crypto-browserify', 'stream-browserify', 'events'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'secure-wallet': resolve(__dirname, 'secure-wallet.html'),
        'multi-device': resolve(__dirname, 'multi-device.html'),
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true, // Fail if port 3000 is unavailable (prevents localStorage issues)
    open: true,
    fs: {
      allow: ['..'],
    },
  },
})
