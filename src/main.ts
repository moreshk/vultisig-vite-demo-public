import './style.css'
import { 
  initializeSDK, 
  createFastVault, 
  verifyVault, 
  getAddress, 
  sendTransaction,
  listVaults,
  getVaultById,
  isVaultFileEncrypted,
  importVault,
  type VaultSummary
} from './sdk'
import type { FastVault } from '@vultisig/sdk'

// Solana RPC endpoint
const SOLANA_RPC = import.meta.env.VITE_SOLANA_RPC || 'https://api.mainnet-beta.solana.com'

// App state
interface AppState {
  step: 'loading' | 'home' | 'create' | 'verify' | 'import' | 'wallet'
  vaultId: string | null
  vault: FastVault | null
  existingVaults: VaultSummary[]
  solanaAddress: string | null
  balance: number | null
  loading: boolean
  error: string | null
  status: string
  txHash: string | null
}

const state: AppState = {
  step: 'loading',
  vaultId: null,
  vault: null,
  existingVaults: [],
  solanaAddress: null,
  balance: null,
  loading: false,
  error: null,
  status: 'Initializing SDK...',
  txHash: null,
}

// DOM Elements
const app = document.getElementById('app')!

// Fetch SOL balance
async function fetchBalance(address: string): Promise<number | null> {
  try {
    const response = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [address],
      }),
    })
    const data = await response.json()
    if (data.result?.value !== undefined) {
      return data.result.value / 1e9
    }
  } catch (err) {
    console.error('Failed to fetch balance:', err)
  }
  return null
}

// Load existing vaults
async function loadVaults() {
  try {
    state.existingVaults = await listVaults()
  } catch (err) {
    console.error('Failed to load vaults:', err)
  }
}

// Render the app
function render() {
  app.innerHTML = `
    <div class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <div class="w-full max-w-md">
        <!-- Header -->
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent mb-2">
            Vultisig Fast Vault
          </h1>
          <p class="text-slate-400 text-sm">
            Self-custodial MPC wallet on Solana
          </p>
          <p class="text-emerald-400/60 text-xs mt-1">
            ✓ Running 100% client-side
          </p>
        </div>

        <!-- Main Card -->
        <div class="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6 shadow-2xl">
          <!-- Status -->
          <div class="mb-6 text-center">
            <span class="text-sm px-3 py-1 rounded-full ${
              state.loading 
                ? 'bg-amber-500/20 text-amber-400' 
                : state.error 
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-emerald-500/20 text-emerald-400'
            }">
              ${state.status}
            </span>
          </div>

          <!-- Error -->
          ${state.error ? `
            <div class="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              ${state.error}
            </div>
          ` : ''}

          ${renderStep()}
        </div>

        <!-- Footer -->
        <div class="text-center mt-6 text-slate-500 text-xs">
          <p>MPC threshold signatures • No single point of failure</p>
          <p class="mt-1">Your key shard + VultiServer = 2-of-2</p>
          <div class="flex justify-center gap-4 mt-4">
            <a href="/secure-wallet.html" class="text-cyan-400 hover:text-cyan-300 text-sm">
              Simulated Demo →
            </a>
            <a href="/multi-device.html" class="text-indigo-400 hover:text-indigo-300 text-sm">
              📱 Real Device Testing →
            </a>
          </div>
        </div>
      </div>
    </div>
  `
  
  attachEventListeners()
}

function renderStep(): string {
  switch (state.step) {
    case 'loading':
      return `
        <div class="text-center py-8">
          <div class="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p class="text-slate-400">Initializing Vultisig SDK...</p>
          <p class="text-slate-500 text-sm mt-2">Loading WASM modules</p>
        </div>
      `
    
    case 'home':
      return `
        <div class="space-y-6">
          <!-- Action Buttons -->
          <div class="grid grid-cols-2 gap-3">
            <button id="btn-create" class="bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-medium py-3 rounded-lg transition">
              Create New
            </button>
            <button id="btn-import" class="bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-lg transition">
              Import .vult
            </button>
          </div>

          <!-- Existing Vaults -->
          ${state.existingVaults.length > 0 ? `
            <div>
              <h3 class="text-slate-300 text-sm font-medium mb-3">
                Your Vaults (${state.existingVaults.length})
              </h3>
              <div class="space-y-2">
                ${state.existingVaults.map((v) => `
                  <button 
                    data-vault-id="${v.id}" 
                    class="vault-item w-full p-3 bg-slate-900/50 hover:bg-slate-900 border border-slate-700 rounded-lg text-left transition"
                    ${state.loading ? 'disabled' : ''}
                  >
                    <div class="flex items-center justify-between">
                      <div>
                        <p class="text-white font-medium">${v.name}</p>
                        <p class="text-slate-500 text-xs">
                          ${v.type === 'fast' ? 'Fast Vault' : 'Secure Vault'} •
                          ${new Date(v.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span class="text-cyan-400 text-sm">Unlock →</span>
                    </div>
                  </button>
                `).join('')}
              </div>
            </div>
          ` : `
            <p class="text-center text-slate-500 text-sm py-4">
              No vaults found. Create a new one or import a backup.
            </p>
          `}
        </div>
      `

    case 'create':
      return `
        <div class="space-y-4">
          <button id="btn-back" class="text-slate-400 text-sm hover:text-white mb-2">
            ← Back
          </button>
          <div>
            <label class="block text-slate-300 text-sm mb-2">Email</label>
            <input
              type="email"
              id="input-email"
              placeholder="your@email.com"
              class="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
              ${state.loading ? 'disabled' : ''}
            />
          </div>
          <div>
            <label class="block text-slate-300 text-sm mb-2">Password</label>
            <input
              type="password"
              id="input-password"
              placeholder="••••••••"
              class="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
              ${state.loading ? 'disabled' : ''}
            />
          </div>
          <div>
            <label class="block text-slate-300 text-sm mb-2">Wallet Name</label>
            <input
              type="text"
              id="input-name"
              value="My Solana Wallet"
              placeholder="My Wallet"
              class="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
              ${state.loading ? 'disabled' : ''}
            />
          </div>
          <button
            id="btn-submit-create"
            class="w-full bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-medium py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            ${state.loading ? 'disabled' : ''}
          >
            ${state.loading ? 'Creating...' : 'Create Fast Vault'}
          </button>
        </div>
      `
    
    case 'verify':
      return `
        <div class="space-y-4">
          <p class="text-slate-400 text-sm text-center">
            Enter the verification code sent to your email
          </p>
          <div>
            <label class="block text-slate-300 text-sm mb-2">Verification Code</label>
            <input
              type="text"
              id="input-code"
              placeholder="123456"
              maxlength="6"
              class="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition text-center text-2xl tracking-widest"
              ${state.loading ? 'disabled' : ''}
            />
          </div>
          <button
            id="btn-verify"
            class="w-full bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-medium py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            ${state.loading ? 'disabled' : ''}
          >
            ${state.loading ? 'Verifying...' : 'Verify & Continue'}
          </button>
        </div>
      `
    
    case 'import':
      return `
        <div class="space-y-4">
          <button id="btn-back" class="text-slate-400 text-sm hover:text-white mb-2">
            ← Back
          </button>
          <div>
            <label class="block text-slate-300 text-sm mb-2">Select .vult Backup File</label>
            <input
              type="file"
              id="input-file"
              accept=".vult"
              class="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-cyan-500 file:text-white hover:file:bg-cyan-400 transition"
              ${state.loading ? 'disabled' : ''}
            />
          </div>
          <div>
            <label class="block text-slate-300 text-sm mb-2">Password (if encrypted)</label>
            <input
              type="password"
              id="input-import-password"
              placeholder="••••••••"
              class="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
              ${state.loading ? 'disabled' : ''}
            />
          </div>
          <button
            id="btn-submit-import"
            class="w-full bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-medium py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            ${state.loading ? 'disabled' : ''}
          >
            ${state.loading ? 'Importing...' : 'Import Vault'}
          </button>
        </div>
      `
    
    case 'wallet':
      return `
        <div class="space-y-6">
          <!-- Back button -->
          <button id="btn-home" class="text-slate-400 text-sm hover:text-white">
            ← Back to Vaults
          </button>

          <!-- Wallet Info -->
          <div class="bg-slate-900/50 rounded-xl p-4">
            <div class="flex items-center justify-between mb-3">
              <span class="text-slate-400 text-sm">Solana Address</span>
              <button id="btn-copy" class="text-cyan-400 text-xs hover:text-cyan-300">
                Copy
              </button>
            </div>
            <p class="font-mono text-sm text-white break-all">
              ${state.solanaAddress}
            </p>
          </div>

          <!-- Balance -->
          <div class="text-center">
            <p class="text-slate-400 text-sm mb-1">Balance</p>
            <p class="text-4xl font-bold text-white">
              ${state.balance !== null ? state.balance.toFixed(6) : '—'}
              <span class="text-lg text-slate-400">SOL</span>
            </p>
            <button id="btn-refresh" class="text-cyan-400 text-sm mt-2 hover:text-cyan-300">
              Refresh
            </button>
          </div>

          <!-- Explorer Link -->
          <a
            href="https://solscan.io/account/${state.solanaAddress}"
            target="_blank"
            rel="noopener noreferrer"
            class="block text-center text-sm text-indigo-400 hover:text-indigo-300"
          >
            View on Solscan ↗
          </a>

          <!-- Send Form -->
          <div class="border-t border-slate-700 pt-6 space-y-4">
            <h3 class="text-white font-medium">Send SOL</h3>
            <div>
              <label class="block text-slate-300 text-sm mb-2">
                Destination Address
              </label>
              <input
                type="text"
                id="input-destination"
                placeholder="Solana address..."
                class="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition text-sm font-mono"
                ${state.loading ? 'disabled' : ''}
              />
            </div>
            <div>
              <label class="block text-slate-300 text-sm mb-2">
                Amount (SOL)
              </label>
              <input
                type="number"
                id="input-amount"
                value="0.001"
                placeholder="0.001"
                step="0.001"
                min="0"
                class="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
                ${state.loading ? 'disabled' : ''}
              />
            </div>
            <button
              id="btn-send"
              class="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-medium py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              ${state.loading ? 'disabled' : ''}
            >
              ${state.loading ? 'Sending...' : 'Send SOL'}
            </button>

            ${state.txHash ? `
              <div class="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                <p class="text-emerald-400 text-sm mb-2">Transaction Sent!</p>
                <a
                  href="https://solscan.io/tx/${state.txHash}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-xs font-mono text-cyan-400 hover:text-cyan-300 break-all"
                >
                  ${state.txHash}
                </a>
              </div>
            ` : ''}
          </div>
        </div>
      `
    
    default:
      return ''
  }
}

function attachEventListeners() {
  // Home screen
  document.getElementById('btn-create')?.addEventListener('click', () => {
    state.step = 'create'
    state.error = null
    render()
  })
  
  document.getElementById('btn-import')?.addEventListener('click', () => {
    state.step = 'import'
    state.error = null
    render()
  })
  
  // Vault items (unlock existing vault)
  document.querySelectorAll('.vault-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      const vaultId = (e.currentTarget as HTMLElement).dataset.vaultId
      if (vaultId) {
        await handleUnlock(vaultId)
      }
    })
  })
  
  // Create screen
  document.getElementById('btn-back')?.addEventListener('click', () => {
    state.step = 'home'
    state.error = null
    render()
  })
  
  document.getElementById('btn-submit-create')?.addEventListener('click', handleCreate)
  
  // Verify screen
  document.getElementById('btn-verify')?.addEventListener('click', handleVerify)
  
  // Import screen
  document.getElementById('btn-submit-import')?.addEventListener('click', handleImport)
  
  // Wallet screen
  document.getElementById('btn-home')?.addEventListener('click', async () => {
    state.step = 'home'
    state.vault = null
    state.vaultId = null
    state.solanaAddress = null
    state.balance = null
    state.error = null
    state.txHash = null
    state.status = 'Welcome to Vultisig'
    await loadVaults()
    render()
  })
  
  document.getElementById('btn-copy')?.addEventListener('click', () => {
    if (state.solanaAddress) {
      navigator.clipboard.writeText(state.solanaAddress)
      const btn = document.getElementById('btn-copy')
      if (btn) {
        btn.textContent = 'Copied!'
        setTimeout(() => {
          btn.textContent = 'Copy'
        }, 2000)
      }
    }
  })
  
  document.getElementById('btn-refresh')?.addEventListener('click', async () => {
    if (state.solanaAddress) {
      state.balance = await fetchBalance(state.solanaAddress)
      render()
    }
  })
  
  document.getElementById('btn-send')?.addEventListener('click', handleSend)
}

async function handleCreate() {
  const email = (document.getElementById('input-email') as HTMLInputElement)?.value
  const password = (document.getElementById('input-password') as HTMLInputElement)?.value
  const name = (document.getElementById('input-name') as HTMLInputElement)?.value || 'My Solana Wallet'
  
  if (!email || !password) {
    state.error = 'Please enter email and password'
    render()
    return
  }
  
  state.loading = true
  state.error = null
  state.status = 'Creating Fast Vault...'
  render()
  
  try {
    const vaultId = await createFastVault(name, email, password)
    state.vaultId = vaultId
    state.status = 'Check your email for verification code'
    state.step = 'verify'
  } catch (err: any) {
    state.error = err.message || 'Failed to create vault'
    state.status = 'Error creating vault'
  } finally {
    state.loading = false
    render()
  }
}

async function handleVerify() {
  const code = (document.getElementById('input-code') as HTMLInputElement)?.value
  
  if (!code || !state.vaultId) {
    state.error = 'Please enter verification code'
    render()
    return
  }
  
  state.loading = true
  state.error = null
  state.status = 'Verifying vault...'
  render()
  
  try {
    const vault = await verifyVault(state.vaultId, code)
    state.vault = vault
    
    // Get Solana address
    state.status = 'Getting Solana address...'
    render()
    
    const address = await getAddress(vault, 'Solana')
    state.solanaAddress = address
    
    // Fetch balance
    state.balance = await fetchBalance(address)
    
    // Reload vaults list
    await loadVaults()
    
    state.status = 'Wallet ready!'
    state.step = 'wallet'
  } catch (err: any) {
    state.error = err.message || 'Verification failed'
    state.status = 'Error verifying vault'
  } finally {
    state.loading = false
    render()
  }
}

async function handleUnlock(vaultId: string) {
  state.loading = true
  state.error = null
  state.status = 'Unlocking vault...'
  render()
  
  try {
    // SDK will prompt for password via onPasswordRequired callback
    const vault = await getVaultById(vaultId)
    state.vault = vault
    state.vaultId = vaultId
    
    // Get Solana address
    state.status = 'Getting Solana address...'
    render()
    
    const address = await getAddress(vault, 'Solana')
    state.solanaAddress = address
    
    // Fetch balance
    state.balance = await fetchBalance(address)
    
    state.status = 'Wallet ready!'
    state.step = 'wallet'
  } catch (err: any) {
    state.error = err.message || 'Failed to unlock vault'
    state.status = 'Error unlocking vault'
  } finally {
    state.loading = false
    render()
  }
}

async function handleImport() {
  const fileInput = document.getElementById('input-file') as HTMLInputElement
  const password = (document.getElementById('input-import-password') as HTMLInputElement)?.value
  
  const file = fileInput?.files?.[0]
  if (!file) {
    state.error = 'Please select a .vult file'
    render()
    return
  }
  
  state.loading = true
  state.error = null
  state.status = 'Importing vault...'
  render()
  
  try {
    // Check if encrypted
    const isEncrypted = await isVaultFileEncrypted(file)
    
    if (isEncrypted && !password) {
      state.error = 'This vault is encrypted. Please enter the password.'
      state.loading = false
      state.status = 'Password required'
      render()
      return
    }
    
    const vault = await importVault(file, password || undefined)
    state.vault = vault
    state.vaultId = vault.id
    
    // Get Solana address
    state.status = 'Getting Solana address...'
    render()
    
    const address = await getAddress(vault, 'Solana')
    state.solanaAddress = address
    
    // Fetch balance
    state.balance = await fetchBalance(address)
    
    // Reload vaults list
    await loadVaults()
    
    state.status = 'Vault imported!'
    state.step = 'wallet'
  } catch (err: any) {
    state.error = err.message || 'Failed to import vault'
    state.status = 'Error importing vault'
  } finally {
    state.loading = false
    render()
  }
}

async function handleSend() {
  const destination = (document.getElementById('input-destination') as HTMLInputElement)?.value
  const amount = (document.getElementById('input-amount') as HTMLInputElement)?.value
  
  if (!destination || !amount || !state.vault) {
    state.error = 'Please enter destination and amount'
    render()
    return
  }
  
  state.loading = true
  state.error = null
  state.txHash = null
  state.status = 'Preparing transaction...'
  render()
  
  try {
    const txHash = await sendTransaction(state.vault, destination, amount, 'Solana')
    state.txHash = txHash
    state.status = 'Transaction sent!'
    
    // Refresh balance
    if (state.solanaAddress) {
      state.balance = await fetchBalance(state.solanaAddress)
    }
  } catch (err: any) {
    state.error = err.message || 'Transaction failed'
    state.status = 'Transaction failed'
  } finally {
    state.loading = false
    render()
  }
}

// Initialize app
async function init() {
  render()
  
  try {
    await initializeSDK()
    await loadVaults()
    state.step = 'home'
    state.status = 'Welcome to Vultisig'
  } catch (err: any) {
    state.error = `SDK initialization failed: ${err.message}`
    state.status = 'Initialization failed'
  }
  
  render()
}

init()
