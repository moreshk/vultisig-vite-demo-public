import './style.css'
import { Vultisig } from '@vultisig/sdk'
import type { SecureVault, VaultCreationStep } from '@vultisig/sdk'
import QRCode from 'qrcode'

// Solana RPC endpoint
const SOLANA_RPC = import.meta.env.VITE_SOLANA_RPC || 'https://api.mainnet-beta.solana.com'
const RELAY_URL = 'https://api.vultisig.com/router'

// App state
interface AppState {
  step: 'loading' | 'home' | 'create-vault' | 'wallet' | 'signing'
  sdk: Vultisig | null
  initialized: boolean
  vault: SecureVault | null
  vaultId: string | null
  solanaAddress: string | null
  balance: number | null
  loading: boolean
  error: string | null
  status: string
  // QR code state
  qrCodeDataUrl: string | null
  qrPayload: string | null
  // Vault creation progress
  devicesJoined: number
  devicesRequired: number
  // Signing state
  signingInProgress: boolean
  txHash: string | null
  // Debug info
  debugInfo: {
    sessionId?: string
    localPartyId?: string
    encryptionKey?: string
    toAddress?: string
    toAmount?: string
    senderAddress?: string
    vaultPublicKey?: string
    qrUrlLength?: number
    compressedDataLength?: number
    protobufLength?: number
  } | null
}

const state: AppState = {
  step: 'loading',
  sdk: null,
  initialized: false,
  vault: null,
  vaultId: null,
  solanaAddress: null,
  balance: null,
  loading: false,
  error: null,
  status: 'Initializing...',
  qrCodeDataUrl: null,
  qrPayload: null,
  devicesJoined: 0,
  devicesRequired: 2,
  signingInProgress: false,
  txHash: null,
  debugInfo: null,
}

const app = document.getElementById('app')!

// Generate QR code from payload
async function generateQRCode(payload: string): Promise<string> {
  try {
    return await QRCode.toDataURL(payload, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
  } catch (err) {
    console.error('Failed to generate QR code:', err)
    throw err
  }
}

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

// Initialize SDK
async function initializeSDK(): Promise<void> {
  state.status = 'Initializing SDK...'
  render()
  
  try {
    state.sdk = new Vultisig({
      onPasswordRequired: async (vaultId: string, vaultName?: string) => {
        const displayName = vaultName || vaultId.slice(0, 8)
        const password = window.prompt(`Enter password for vault: ${displayName}`)
        if (!password) throw new Error('Password required')
        return password
      },
    })
    
    await state.sdk.initialize()
    state.initialized = true
    
    // Check for existing vaults
    const vaults = await state.sdk.listVaults()
    const secureVaults = vaults.filter(v => v.type === 'secure')
    
    if (secureVaults.length > 0) {
      // Load the first secure vault
      state.vault = secureVaults[0] as SecureVault
      state.vaultId = state.vault.id
      state.solanaAddress = await state.vault.address('Solana')
      state.balance = await fetchBalance(state.solanaAddress)
      state.step = 'wallet'
      state.status = 'Wallet ready'
    } else {
      state.step = 'home'
      state.status = 'Ready'
    }
    
  } catch (err: any) {
    state.error = err.message
    state.status = 'Initialization failed'
  }
  
  render()
}

// Create secure vault with real MPC keygen
async function createSecureVault(): Promise<void> {
  if (!state.sdk) return
  
  const name = (document.getElementById('vault-name') as HTMLInputElement)?.value || 'My Secure Vault'
  const password = (document.getElementById('vault-password') as HTMLInputElement)?.value || ''
  const deviceCount = parseInt((document.getElementById('device-count') as HTMLSelectElement)?.value || '2')
  
  state.loading = true
  state.step = 'create-vault'
  state.status = 'Starting vault creation...'
  state.error = null
  state.qrCodeDataUrl = null
  state.qrPayload = null
  state.devicesJoined = 0
  state.devicesRequired = deviceCount
  render()
  
  try {
    const result = await state.sdk.createSecureVault({
      name,
      password,
      devices: deviceCount,
      onProgress: (step: VaultCreationStep) => {
        state.status = step.message
        render()
      },
      onQRCodeReady: async (qrPayload: string) => {
        console.log('QR Payload ready for mobile scanning')
        state.qrPayload = qrPayload
        state.qrCodeDataUrl = await generateQRCode(qrPayload)
        state.status = 'Scan QR code with Vultisig mobile app'
        render()
      },
      onDeviceJoined: (deviceId: string, totalJoined: number, required: number) => {
        console.log(`Device joined: ${deviceId}, ${totalJoined}/${required}`)
        state.devicesJoined = totalJoined
        state.devicesRequired = required
        state.status = `${totalJoined}/${required} devices joined`
        render()
      },
    })
    
    state.vault = result.vault
    state.vaultId = result.vaultId
    state.solanaAddress = await result.vault.address('Solana')
    state.balance = await fetchBalance(state.solanaAddress)
    state.step = 'wallet'
    state.status = 'Vault created successfully!'
    state.qrCodeDataUrl = null
    state.qrPayload = null
    
  } catch (err: any) {
    state.error = err.message
    state.status = 'Vault creation failed'
    state.step = 'home'
  } finally {
    state.loading = false
    render()
  }
}

// Cancel vault creation
function cancelVaultCreation(): void {
  state.step = 'home'
  state.status = 'Ready'
  state.loading = false
  state.qrCodeDataUrl = null
  state.qrPayload = null
  state.error = null
  render()
}

// Send transaction using SDK's built-in signing flow (like the browser example)
async function sendTransaction(): Promise<void> {
  if (!state.vault || !state.sdk) return
  
  const toAddress = (document.getElementById('tx-destination') as HTMLInputElement)?.value
  const amount = (document.getElementById('tx-amount') as HTMLInputElement)?.value || '0.001'
  
  if (!toAddress) {
    state.error = 'Please enter a destination address'
    render()
    return
  }
  
  state.loading = true
  state.signingInProgress = true
  state.step = 'signing'
  state.status = 'Preparing transaction...'
  state.error = null
  state.qrCodeDataUrl = null
  state.qrPayload = null
  state.txHash = null
  state.debugInfo = null
  render()
  
  try {
    const senderAddress = await state.vault.address('Solana')
    const amountFloat = parseFloat(amount)
    const amountBaseUnits = BigInt(Math.floor(amountFloat * 1e9))
    
    const coin = {
      chain: 'Solana',
      address: senderAddress,
      decimals: 9,
      ticker: 'SOL',
    }
    
    // Prepare transaction
    state.status = 'Preparing transaction payload...'
    render()
    
    const keysignPayload = await state.vault.prepareSendTx({
      coin,
      receiver: toAddress,
      amount: amountBaseUnits,
    })
    
    console.log('KeysignPayload:', keysignPayload)
    
    // Extract message hashes
    const messageHashes = await state.vault.extractMessageHashes(keysignPayload)
    console.log('Message hashes:', messageHashes)
    
    state.status = 'Waiting for QR code from SDK...'
    render()
    
    // Use SDK's built-in signing flow - let it generate QR and handle relay
    // This is how the browser example works
    const signature = await state.vault.sign(
      {
        chain: 'Solana',
        transaction: keysignPayload,
        messageHashes,
      },
      {
        onQRCodeReady: async (qrPayload: string) => {
          console.log('SDK generated QR payload:', qrPayload)
          state.qrPayload = qrPayload
          state.qrCodeDataUrl = await generateQRCode(qrPayload)
          state.status = 'Scan QR code with Vultisig app to approve'
          
          // Add debug info
          state.debugInfo = {
            sessionId: 'SDK-managed',
            localPartyId: 'SDK-managed',
            vaultPublicKey: state.vault?.id || '',
            toAddress,
            toAmount: amountBaseUnits.toString(),
            senderAddress,
            compressedDataLength: qrPayload.length,
            qrUrlLength: qrPayload.length,
          }
          render()
        },
        onDeviceJoined: (deviceId: string, totalJoined: number, required: number) => {
          console.log(`Device joined: ${deviceId}, ${totalJoined}/${required}`)
          state.devicesJoined = totalJoined
          state.devicesRequired = required
          state.status = `${totalJoined}/${required} devices joined - signing in progress...`
          render()
        },
      }
    )
    
    console.log('Signature received:', signature)
    
    // Broadcast transaction
    state.status = 'Broadcasting transaction...'
    state.qrCodeDataUrl = null
    render()
    
    const txHash = await state.vault.broadcastTx({
      chain: 'Solana',
      keysignPayload,
      signature,
    })
    
    state.txHash = txHash
    state.status = 'Transaction sent!'
    
    // Refresh balance
    state.balance = await fetchBalance(senderAddress)
    
  } catch (err: any) {
    console.error('Transaction error:', err)
    state.error = err.message
    state.status = 'Transaction failed'
  } finally {
    state.loading = false
    state.signingInProgress = false
    state.step = 'wallet'
    state.qrCodeDataUrl = null
    state.qrPayload = null
    state.debugInfo = null
    render()
  }
}

// Cancel signing
function cancelSigning(): void {
  state.step = 'wallet'
  state.status = 'Wallet ready'
  state.loading = false
  state.signingInProgress = false
  state.qrCodeDataUrl = null
  state.qrPayload = null
  state.debugInfo = null
  render()
}

// Test signing QR generation (without balance check)
// Test signing using SDK's built-in signing flow (same as real transaction but with test data)
async function testSigningQR(): Promise<void> {
  if (!state.vault || !state.sdk) return
  
  state.loading = true
  state.signingInProgress = true
  state.step = 'signing'
  state.status = 'Preparing test signing session...'
  state.error = null
  state.qrCodeDataUrl = null
  state.qrPayload = null
  state.txHash = null
  state.debugInfo = null
  render()
  
  try {
    const senderAddress = await state.vault.address('Solana')
    // Use a safe test address - SOL native mint address
    const toAddress = 'So11111111111111111111111111111111111111112'
    const amountBaseUnits = BigInt(1000000) // 0.001 SOL in lamports
    
    const coin = {
      chain: 'Solana',
      address: senderAddress,
      decimals: 9,
      ticker: 'SOL',
    }
    
    // Prepare transaction (this will fail if balance is too low, but creates a valid payload)
    state.status = 'Preparing test transaction payload...'
    render()
    
    const keysignPayload = await state.vault.prepareSendTx({
      coin,
      receiver: toAddress,
      amount: amountBaseUnits,
    })
    
    console.log('Test KeysignPayload:', keysignPayload)
    
    // Extract message hashes
    const messageHashes = await state.vault.extractMessageHashes(keysignPayload)
    console.log('Test Message hashes:', messageHashes)
    
    state.status = 'Starting SDK signing flow - waiting for QR...'
    render()
    
    // Use SDK's built-in signing flow (fixed in v0.4.2)
    const signature = await state.vault.sign(
      {
        chain: 'Solana',
        transaction: keysignPayload,
        messageHashes,
      },
      {
        onQRCodeReady: async (qrPayload: string) => {
          console.log('=== SDK SIGNING QR ===')
          console.log('QR payload length:', qrPayload.length)
          console.log('QR payload:', qrPayload.substring(0, 200) + '...')
          console.log('======================')
          
          state.qrPayload = qrPayload
          state.qrCodeDataUrl = await generateQRCode(qrPayload)
          state.status = 'Scan QR with Vultisig app to approve'
          
          state.debugInfo = {
            sessionId: 'SDK-managed',
            localPartyId: 'SDK-managed',
            vaultPublicKey: state.vault?.id || '',
            toAddress,
            toAmount: amountBaseUnits.toString(),
            senderAddress,
            compressedDataLength: qrPayload.length,
            qrUrlLength: qrPayload.length,
          }
          render()
        },
        onDeviceJoined: (deviceId: string, totalJoined: number, required: number) => {
          console.log(`Test: Device joined: ${deviceId}, ${totalJoined}/${required}`)
          state.devicesJoined = totalJoined
          state.devicesRequired = required
          state.status = `Test: ${totalJoined}/${required} devices joined - computing signatures...`
          render()
        },
      }
    )
    
    console.log('Test signing completed! Signature:', signature)
    state.status = `✅ Test signing successful! (not broadcasting)`
    state.loading = false
    
  } catch (err: any) {
    console.error('Test signing error:', err)
    state.error = err.message
    state.status = 'Test signing failed'
    state.loading = false
    state.signingInProgress = false
    state.step = 'wallet'
  }
  
  render()
}

// Delete vault
async function deleteVault(): Promise<void> {
  if (!state.sdk || !state.vault) return
  
  if (!confirm('Delete this vault? This cannot be undone.')) return
  
  try {
    await state.sdk.deleteVault(state.vault)
    state.vault = null
    state.vaultId = null
    state.solanaAddress = null
    state.balance = null
    state.step = 'home'
    state.status = 'Vault deleted'
  } catch (err: any) {
    state.error = err.message
  }
  
  render()
}

// Refresh balance
async function refreshBalance(): Promise<void> {
  if (!state.solanaAddress) return
  state.balance = await fetchBalance(state.solanaAddress)
  render()
}

// Render UI
function render(): void {
  app.innerHTML = `
    <div class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4">
      <div class="max-w-lg mx-auto">
        <!-- Header -->
        <div class="text-center mb-6">
          <h1 class="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent mb-2">
            Multi-Device Vault
          </h1>
          <p class="text-slate-400 text-sm">
            Real device testing with Vultisig mobile app
          </p>
          <div class="flex justify-center gap-4 mt-3">
            <a href="/" class="text-cyan-400 text-sm hover:text-cyan-300">Fast Vault Demo</a>
            <span class="text-slate-600">|</span>
            <a href="/secure-wallet.html" class="text-cyan-400 text-sm hover:text-cyan-300">Simulated Demo</a>
          </div>
        </div>

        <!-- Main Card -->
        <div class="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6 shadow-2xl">
          <!-- Status -->
          <div class="mb-4 text-center">
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

        <!-- Instructions -->
        <div class="mt-6 bg-slate-800/30 rounded-xl p-4">
          <h3 class="text-slate-300 font-medium mb-2">📱 How to Test with Mobile</h3>
          <ol class="space-y-2 text-sm text-slate-400">
            <li>1. Download <a href="https://apps.apple.com/app/vultisig/id6503023896" target="_blank" class="text-cyan-400 hover:underline">Vultisig iOS</a> or <a href="https://play.google.com/store/apps/details?id=com.vultisig.wallet" target="_blank" class="text-cyan-400 hover:underline">Android</a> app</li>
            <li>2. Create vault: Click "Create" here, scan QR with mobile app</li>
            <li>3. Sign transactions: Initiate here, approve on mobile</li>
          </ol>
        </div>

        <!-- Footer -->
        <div class="text-center mt-6 text-slate-500 text-xs">
          <p>MPC threshold signatures • Both devices required to sign</p>
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
          <p class="text-slate-400">Initializing SDK...</p>
        </div>
      `
    
    case 'home':
      return `
        <div class="space-y-4">
          <div class="text-center py-4">
            <p class="text-slate-400 mb-4">No secure vault found. Create one to get started.</p>
          </div>
          
          <div>
            <label class="block text-slate-300 text-sm mb-2">Vault Name</label>
            <input
              type="text"
              id="vault-name"
              value="My Secure Vault"
              class="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
            />
          </div>
          
          <div>
            <label class="block text-slate-300 text-sm mb-2">Password (optional)</label>
            <input
              type="password"
              id="vault-password"
              placeholder="••••••••"
              class="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
            />
          </div>
          
          <div>
            <label class="block text-slate-300 text-sm mb-2">Number of Devices</label>
            <select
              id="device-count"
              class="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition"
            >
              <option value="2">2 devices (2-of-2)</option>
              <option value="3">3 devices (2-of-3)</option>
            </select>
          </div>
          
          <button
            id="btn-create"
            class="w-full bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-medium py-3 rounded-lg transition"
          >
            Create Secure Vault
          </button>
        </div>
      `
    
    case 'create-vault':
      return `
        <div class="space-y-4">
          ${state.qrCodeDataUrl ? `
            <div class="text-center">
              <p class="text-slate-300 mb-4">Scan with Vultisig mobile app:</p>
              <div class="bg-white p-4 rounded-xl inline-block">
                <img src="${state.qrCodeDataUrl}" alt="QR Code" class="w-64 h-64" />
              </div>
              <p class="text-slate-400 text-sm mt-4">
                ${state.devicesJoined}/${state.devicesRequired} devices joined
              </p>
            </div>
          ` : `
            <div class="text-center py-8">
              <div class="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4"></div>
              <p class="text-slate-400">Generating QR code...</p>
            </div>
          `}
          
          <button
            id="btn-cancel-create"
            class="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      `
    
    case 'wallet':
      return `
        <div class="space-y-6">
          <!-- Wallet Info -->
          <div class="bg-slate-900/50 rounded-xl p-4">
            <div class="flex items-center justify-between mb-3">
              <span class="text-slate-400 text-sm">Solana Address</span>
              <button id="btn-copy" class="text-cyan-400 text-xs hover:text-cyan-300">Copy</button>
            </div>
            <p class="font-mono text-sm text-white break-all">${state.solanaAddress}</p>
          </div>

          <!-- Balance -->
          <div class="text-center">
            <p class="text-slate-400 text-sm mb-1">Balance</p>
            <p class="text-4xl font-bold text-white">
              ${state.balance !== null ? state.balance.toFixed(6) : '—'}
              <span class="text-lg text-slate-400">SOL</span>
            </p>
            <button id="btn-refresh" class="text-cyan-400 text-sm mt-2 hover:text-cyan-300">Refresh</button>
          </div>

          <!-- Explorer Link -->
          <a
            href="https://solscan.io/account/${state.solanaAddress}"
            target="_blank"
            class="block text-center text-sm text-indigo-400 hover:text-indigo-300"
          >
            View on Solscan ↗
          </a>

          <!-- Transaction Success -->
          ${state.txHash ? `
            <div class="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <p class="text-emerald-400 text-sm mb-2">Transaction Sent!</p>
              <a
                href="https://solscan.io/tx/${state.txHash}"
                target="_blank"
                class="text-xs font-mono text-cyan-400 hover:text-cyan-300 break-all"
              >
                ${state.txHash}
              </a>
            </div>
          ` : ''}

          <!-- Send Form -->
          <div class="border-t border-slate-700 pt-6 space-y-4">
            <h3 class="text-white font-medium">Send SOL</h3>
            <div>
              <label class="block text-slate-300 text-sm mb-2">Destination Address</label>
              <input
                type="text"
                id="tx-destination"
                placeholder="Solana address..."
                class="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition text-sm font-mono"
                ${state.loading ? 'disabled' : ''}
              />
            </div>
            <div>
              <label class="block text-slate-300 text-sm mb-2">Amount (SOL)</label>
              <input
                type="number"
                id="tx-amount"
                value="0.001"
                step="0.001"
                min="0"
                class="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
                ${state.loading ? 'disabled' : ''}
              />
            </div>
            <button
              id="btn-send"
              class="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-medium py-3 rounded-lg transition disabled:opacity-50"
              ${state.loading ? 'disabled' : ''}
            >
              Send (requires mobile approval)
            </button>
            
            <button
              id="btn-test-qr"
              class="w-full bg-amber-600 hover:bg-amber-500 text-white font-medium py-2 rounded-lg transition text-sm"
              ${state.loading ? 'disabled' : ''}
            >
              🔍 Test Signing QR (Debug)
            </button>
          </div>

          <!-- Delete Vault -->
          <div class="pt-4 border-t border-slate-700">
            <button
              id="btn-delete"
              class="w-full text-red-400 hover:text-red-300 text-sm py-2"
            >
              Delete Vault
            </button>
          </div>
        </div>
      `
    
    case 'signing':
      return `
        <div class="space-y-4">
          <div class="text-center">
            <h3 class="text-white font-medium mb-4">Transaction Signing</h3>
            
            ${state.qrCodeDataUrl ? `
              <p class="text-slate-300 mb-4">Scan with Vultisig app to approve:</p>
              <div class="bg-white p-4 rounded-xl inline-block">
                <img src="${state.qrCodeDataUrl}" alt="Signing QR Code" class="w-64 h-64" />
              </div>
              <p class="text-slate-400 text-sm mt-4">
                Waiting for mobile device to sign...
              </p>
              
              <!-- Debug Info -->
              ${state.debugInfo ? `
                <div class="mt-6 bg-slate-900/80 rounded-lg p-4 text-left">
                  <h4 class="text-amber-400 text-sm font-medium mb-3">🔍 Debug Info</h4>
                  <div class="space-y-2 text-xs font-mono">
                    <div class="flex justify-between">
                      <span class="text-slate-500">Session ID:</span>
                      <span class="text-slate-300">${state.debugInfo.sessionId}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-slate-500">Local Party:</span>
                      <span class="text-slate-300">${state.debugInfo.localPartyId}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-slate-500">Vault Key:</span>
                      <span class="text-slate-300">${state.debugInfo.vaultPublicKey}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-slate-500">To:</span>
                      <span class="text-slate-300 break-all">${state.debugInfo.toAddress?.substring(0, 20)}...</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-slate-500">Amount:</span>
                      <span class="text-slate-300">${state.debugInfo.toAmount} lamports</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-slate-500">From:</span>
                      <span class="text-slate-300">${state.debugInfo.senderAddress?.substring(0, 20)}...</span>
                    </div>
                    <div class="border-t border-slate-700 pt-2 mt-2">
                      <div class="flex justify-between">
                        <span class="text-slate-500">Compressed data:</span>
                        <span class="text-slate-300">${state.debugInfo.compressedDataLength} chars</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-slate-500">QR URL length:</span>
                        <span class="text-slate-300">${state.debugInfo.qrUrlLength} chars</span>
                      </div>
                    </div>
                  </div>
                  
                  <div class="mt-3 pt-3 border-t border-slate-700">
                    <p class="text-slate-500 text-xs mb-2">Raw QR Payload (click to copy):</p>
                    <div 
                      id="qr-payload-text"
                      class="bg-slate-800 p-2 rounded text-xs text-slate-400 break-all max-h-24 overflow-y-auto cursor-pointer hover:bg-slate-700"
                      onclick="navigator.clipboard.writeText(this.innerText); this.classList.add('ring-2', 'ring-cyan-500'); setTimeout(() => this.classList.remove('ring-2', 'ring-cyan-500'), 1000)"
                    >${state.qrPayload}</div>
                  </div>
                </div>
              ` : ''}
            ` : `
              <div class="py-8">
                <div class="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4"></div>
                <p class="text-slate-400">${state.status}</p>
              </div>
            `}
          </div>
          
          <button
            id="btn-cancel-signing"
            class="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      `
    
    default:
      return ''
  }
}

function attachEventListeners(): void {
  document.getElementById('btn-create')?.addEventListener('click', createSecureVault)
  document.getElementById('btn-cancel-create')?.addEventListener('click', cancelVaultCreation)
  document.getElementById('btn-send')?.addEventListener('click', sendTransaction)
  document.getElementById('btn-test-qr')?.addEventListener('click', testSigningQR)
  document.getElementById('btn-cancel-signing')?.addEventListener('click', cancelSigning)
  document.getElementById('btn-delete')?.addEventListener('click', deleteVault)
  document.getElementById('btn-refresh')?.addEventListener('click', refreshBalance)
  
  document.getElementById('btn-copy')?.addEventListener('click', () => {
    if (state.solanaAddress) {
      navigator.clipboard.writeText(state.solanaAddress)
      const btn = document.getElementById('btn-copy')
      if (btn) {
        btn.textContent = 'Copied!'
        setTimeout(() => { btn.textContent = 'Copy' }, 2000)
      }
    }
  })
}

// Initialize
async function init(): Promise<void> {
  render()
  await initializeSDK()
}

init()
