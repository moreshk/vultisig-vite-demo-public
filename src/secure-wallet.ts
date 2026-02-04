import './style.css'
import { Vultisig } from '@vultisig/sdk'
import type { SecureVault, VaultCreationStep } from '@vultisig/sdk'

/**
 * Prefixed localStorage storage for isolated device simulation
 * Implements the SDK's Storage interface
 */
class PrefixedStorage {
  constructor(private prefix: string) {}

  async get<T>(key: string): Promise<T | null> {
    const value = localStorage.getItem(`${this.prefix}:${key}`)
    return value ? JSON.parse(value) : null
  }

  async set<T>(key: string, value: T): Promise<void> {
    localStorage.setItem(`${this.prefix}:${key}`, JSON.stringify(value))
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(`${this.prefix}:${key}`)
  }

  async clear(): Promise<void> {
    const keysToDelete: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(`${this.prefix}:`)) {
        keysToDelete.push(key)
      }
    }
    keysToDelete.forEach(k => localStorage.removeItem(k))
  }

  async list(): Promise<string[]> {
    const result: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(`${this.prefix}:`)) {
        result.push(key.slice(this.prefix.length + 1))
      }
    }
    return result
  }
}

// Solana RPC endpoint
const SOLANA_RPC = import.meta.env.VITE_SOLANA_RPC || 'https://api.mainnet-beta.solana.com'

// Device identifiers
type DeviceId = 'device-a' | 'device-b'

// Device state
interface DeviceState {
  id: DeviceId
  name: string
  sdk: Vultisig | null
  initialized: boolean
  vault: SecureVault | null
  vaultId: string | null
  solanaAddress: string | null
  balance: number | null
  status: string
  error: string | null
  loading: boolean
  // Keygen state
  qrPayload: string | null
  devicesJoined: number
  devicesRequired: number
  // Signing state
  signingPayload: string | null
  pendingTxRequest: PendingTxRequest | null
}

// Transaction request for approval
interface PendingTxRequest {
  fromDevice: DeviceId
  toAddress: string
  amount: string
  chain: string
  signingPayload: string
}

// App state
interface AppState {
  activeDevice: DeviceId
  deviceA: DeviceState
  deviceB: DeviceState
  // Shared keygen/signing payload (simulates QR code transfer)
  sharedPayload: string | null
  sharedPayloadType: 'keygen' | 'signing' | null
  // Signing session
  pendingTransaction: PendingTxRequest | null
}

const createInitialDeviceState = (id: DeviceId, name: string): DeviceState => ({
  id,
  name,
  sdk: null,
  initialized: false,
  vault: null,
  vaultId: null,
  solanaAddress: null,
  balance: null,
  status: 'Not initialized',
  error: null,
  loading: false,
  qrPayload: null,
  devicesJoined: 0,
  devicesRequired: 2,
  signingPayload: null,
  pendingTxRequest: null,
})

const state: AppState = {
  activeDevice: 'device-a',
  deviceA: createInitialDeviceState('device-a', 'Device A (Initiator)'),
  deviceB: createInitialDeviceState('device-b', 'Device B (Joiner)'),
  sharedPayload: null,
  sharedPayloadType: null,
  pendingTransaction: null,
}

// DOM element
const app = document.getElementById('app')!

// Helper to get active device state
function getActiveDevice(): DeviceState {
  return state.activeDevice === 'device-a' ? state.deviceA : state.deviceB
}

function getOtherDevice(): DeviceState {
  return state.activeDevice === 'device-a' ? state.deviceB : state.deviceA
}

function setDeviceState(id: DeviceId, updates: Partial<DeviceState>): void {
  if (id === 'device-a') {
    state.deviceA = { ...state.deviceA, ...updates }
  } else {
    state.deviceB = { ...state.deviceB, ...updates }
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

// Initialize SDK for a device
async function initializeDevice(deviceId: DeviceId): Promise<void> {
  const device = deviceId === 'device-a' ? state.deviceA : state.deviceB
  
  if (device.initialized) return
  
  setDeviceState(deviceId, { loading: true, status: 'Initializing SDK...' })
  render()
  
  try {
    const storage = new PrefixedStorage(deviceId)
    const sdk = new Vultisig({
      storage,
      onPasswordRequired: async (vaultId: string, vaultName?: string) => {
        const displayName = vaultName || vaultId.slice(0, 8)
        const password = window.prompt(`[${device.name}] Enter password for vault: ${displayName}`)
        if (!password) throw new Error('Password required')
        return password
      },
    })
    
    await sdk.initialize()
    
    // Check if there's an existing vault
    const vaults = await sdk.listVaults()
    let vault: SecureVault | null = null
    let solanaAddress: string | null = null
    let balance: number | null = null
    
    if (vaults.length > 0 && vaults[0].type === 'secure') {
      vault = vaults[0] as SecureVault
      solanaAddress = await vault.address('Solana')
      balance = await fetchBalance(solanaAddress)
    }
    
    setDeviceState(deviceId, {
      sdk,
      initialized: true,
      vault,
      vaultId: vault?.id || null,
      solanaAddress,
      balance,
      loading: false,
      status: vault ? 'Vault ready' : 'Ready - No vault',
    })
  } catch (err: any) {
    setDeviceState(deviceId, {
      loading: false,
      error: err.message,
      status: 'Initialization failed',
    })
  }
  
  render()
}

// Create secure vault (Device A only)
async function createSecureVault(): Promise<void> {
  const device = state.deviceA
  if (!device.sdk) return
  
  const name = (document.getElementById('vault-name') as HTMLInputElement)?.value || 'Shared Secure Vault'
  const password = (document.getElementById('vault-password') as HTMLInputElement)?.value || ''
  
  setDeviceState('device-a', {
    loading: true,
    status: 'Creating vault...',
    error: null,
    qrPayload: null,
    devicesJoined: 0,
  })
  render()
  
  try {
    const result = await device.sdk.createSecureVault({
      name,
      password,
      devices: 2, // 2-of-2 for this demo
      onProgress: (step: VaultCreationStep) => {
        setDeviceState('device-a', { status: step.message })
        render()
      },
      onQRCodeReady: (qrPayload: string) => {
        console.log('QR Payload ready:', qrPayload.slice(0, 100) + '...')
        setDeviceState('device-a', { qrPayload })
        // Share payload for Device B to join
        state.sharedPayload = qrPayload
        state.sharedPayloadType = 'keygen'
        render()
      },
      onDeviceJoined: (deviceId: string, totalJoined: number, required: number) => {
        console.log(`Device joined: ${deviceId}, ${totalJoined}/${required}`)
        setDeviceState('device-a', {
          devicesJoined: totalJoined,
          devicesRequired: required,
          status: `${totalJoined}/${required} devices joined`,
        })
        render()
      },
    })
    
    const solanaAddress = await result.vault.address('Solana')
    const balance = await fetchBalance(solanaAddress)
    
    setDeviceState('device-a', {
      vault: result.vault,
      vaultId: result.vaultId,
      solanaAddress,
      balance,
      loading: false,
      status: 'Vault created!',
      qrPayload: null,
    })
    
    // Clear shared payload
    state.sharedPayload = null
    state.sharedPayloadType = null
    
  } catch (err: any) {
    setDeviceState('device-a', {
      loading: false,
      error: err.message,
      status: 'Vault creation failed',
    })
  }
  
  render()
}

// Join secure vault (Device B only)
async function joinSecureVault(): Promise<void> {
  const device = state.deviceB
  if (!device.sdk || !state.sharedPayload) return
  
  const password = (document.getElementById('join-password') as HTMLInputElement)?.value || ''
  
  setDeviceState('device-b', {
    loading: true,
    status: 'Joining vault...',
    error: null,
  })
  render()
  
  try {
    const result = await device.sdk.joinSecureVault(state.sharedPayload, {
      devices: 2,
      password,
      onProgress: (step: VaultCreationStep) => {
        setDeviceState('device-b', { status: step.message })
        render()
      },
      onDeviceJoined: (deviceId: string, totalJoined: number, required: number) => {
        setDeviceState('device-b', {
          devicesJoined: totalJoined,
          devicesRequired: required,
          status: `${totalJoined}/${required} devices joined`,
        })
        render()
      },
    })
    
    const solanaAddress = await result.vault.address('Solana')
    const balance = await fetchBalance(solanaAddress)
    
    setDeviceState('device-b', {
      vault: result.vault,
      vaultId: result.vaultId,
      solanaAddress,
      balance,
      loading: false,
      status: 'Joined vault!',
    })
    
  } catch (err: any) {
    setDeviceState('device-b', {
      loading: false,
      error: err.message,
      status: 'Join failed',
    })
  }
  
  render()
}

// Initiate transaction (creates signing request)
// For this demo, we separate the "create approval request" step from actual MPC signing
// to better demonstrate the multi-device approval workflow.
async function initiateTransaction(fromDeviceId: DeviceId): Promise<void> {
  const device = fromDeviceId === 'device-a' ? state.deviceA : state.deviceB
  if (!device.vault) return
  
  const toAddress = (document.getElementById('tx-destination') as HTMLInputElement)?.value
  const amount = (document.getElementById('tx-amount') as HTMLInputElement)?.value || '0.001'
  
  if (!toAddress) {
    setDeviceState(fromDeviceId, { error: 'Please enter destination address' })
    render()
    return
  }
  
  setDeviceState(fromDeviceId, {
    loading: true,
    status: 'Preparing transaction...',
    error: null,
  })
  render()
  
  try {
    // Prepare the transaction (get keysign payload)
    const senderAddress = await device.vault.address('Solana')
    const amountFloat = parseFloat(amount)
    const amountBaseUnits = BigInt(Math.floor(amountFloat * 1e9))
    
    const coin = {
      chain: 'Solana',
      address: senderAddress,
      decimals: 9,
      ticker: 'SOL',
    }
    
    // Prepare transaction payload
    const keysignPayload = await device.vault.prepareSendTx({
      coin,
      receiver: toAddress,
      amount: amountBaseUnits,
    })
    
    // Extract message hashes for signing
    const messageHashes = await device.vault.extractMessageHashes(keysignPayload)
    
    // For this demo, we create a signing request that the other device can see
    // In a real multi-device setup, both devices would participate in MPC via relay
    const signingPayload = JSON.stringify({
      chain: 'Solana',
      messageHashes,
      toAddress,
      amount,
      timestamp: Date.now(),
    })
    
    // Set pending transaction for approval workflow
    state.pendingTransaction = {
      fromDevice: fromDeviceId,
      toAddress,
      amount,
      chain: 'Solana',
      signingPayload,
    }
    state.sharedPayload = signingPayload
    state.sharedPayloadType = 'signing'
    
    setDeviceState(fromDeviceId, {
      loading: false,
      status: 'Waiting for approval...',
      signingPayload,
    })
    
    console.log('Transaction prepared, waiting for approval from other device')
    
  } catch (err: any) {
    setDeviceState(fromDeviceId, {
      loading: false,
      error: err.message,
      status: 'Transaction failed',
      signingPayload: null,
    })
    state.pendingTransaction = null
    state.sharedPayload = null
    state.sharedPayloadType = null
  }
  
  render()
}

// Reject a pending transaction
function rejectTransaction(): void {
  state.pendingTransaction = null
  state.sharedPayload = null
  state.sharedPayloadType = null
  
  // Reset both devices' loading states
  setDeviceState('device-a', {
    loading: false,
    status: 'Transaction rejected',
    signingPayload: null,
  })
  setDeviceState('device-b', {
    loading: false,
    status: 'Transaction rejected',
  })
  
  render()
}

// Approve/sign transaction (other device)
// In a real multi-device setup, both devices participate in MPC signing through the relay server.
// For this demo, clicking "Approve" simulates Device B joining the signing session.
async function approveTransaction(approverDeviceId: DeviceId): Promise<void> {
  const device = approverDeviceId === 'device-a' ? state.deviceA : state.deviceB
  const initiatorId = approverDeviceId === 'device-a' ? 'device-b' : 'device-a'
  
  if (!device.vault || !state.pendingTransaction) return
  
  const pendingTx = state.pendingTransaction
  
  setDeviceState(approverDeviceId, {
    loading: true,
    status: 'Joining MPC signing session...',
    error: null,
  })
  setDeviceState(initiatorId, {
    status: 'Other device joined! MPC signing in progress...',
  })
  render()
  
  try {
    // Simulate the MPC signing process
    // In reality, both devices would:
    // 1. Connect to the relay server with the same sessionId
    // 2. Exchange encrypted MPC messages
    // 3. Each compute their partial signature using their key share
    // 4. Combine partial signatures into final signature
    
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    setDeviceState(approverDeviceId, { status: 'Computing partial signature...' })
    setDeviceState(initiatorId, { status: 'Computing partial signature...' })
    render()
    
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    setDeviceState(approverDeviceId, { status: 'Combining signatures...' })
    setDeviceState(initiatorId, { status: 'Combining signatures...' })
    render()
    
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Simulate successful signing and broadcast
    const mockTxHash = `${Math.random().toString(36).substring(2, 10)}...${Math.random().toString(36).substring(2, 10)}`
    
    // Update both devices with success
    setDeviceState(approverDeviceId, {
      loading: false,
      status: `✓ Transaction signed & sent!`,
    })
    setDeviceState(initiatorId, {
      loading: false,
      status: `✓ Tx: ${mockTxHash}`,
      signingPayload: null,
    })
    
    // Refresh balances (simulated - would deduct from actual balance in real tx)
    const newBalance = (device.balance || 0) - parseFloat(pendingTx.amount) - 0.000005 // Minus fee
    setDeviceState('device-a', { balance: Math.max(0, newBalance) })
    setDeviceState('device-b', { balance: Math.max(0, newBalance) })
    
    // Clear pending transaction
    state.pendingTransaction = null
    state.sharedPayload = null
    state.sharedPayloadType = null
    
    // Reset status after showing success
    setTimeout(() => {
      setDeviceState('device-a', { status: 'Vault ready' })
      setDeviceState('device-b', { status: 'Vault ready' })
      render()
    }, 5000)
    
  } catch (err: any) {
    setDeviceState(approverDeviceId, {
      loading: false,
      error: err.message,
      status: 'Signing failed',
    })
    setDeviceState(initiatorId, {
      loading: false,
      error: 'Other device failed to sign',
      status: 'Signing failed',
    })
  }
  
  render()
}

// Delete vault from device
async function deleteVault(deviceId: DeviceId): Promise<void> {
  const device = deviceId === 'device-a' ? state.deviceA : state.deviceB
  if (!device.sdk || !device.vault) return
  
  if (!confirm(`Delete vault from ${device.name}? This cannot be undone.`)) return
  
  try {
    await device.sdk.deleteVault(device.vault)
    setDeviceState(deviceId, {
      vault: null,
      vaultId: null,
      solanaAddress: null,
      balance: null,
      status: 'Vault deleted',
    })
  } catch (err: any) {
    setDeviceState(deviceId, { error: err.message })
  }
  
  render()
}

// Render UI
function render(): void {
  app.innerHTML = `
    <div class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4">
      <div class="max-w-6xl mx-auto">
        <!-- Header -->
        <div class="text-center mb-6">
          <h1 class="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent mb-2">
            Secure Vault Demo
          </h1>
          <p class="text-slate-400 text-sm">
            Multi-device MPC wallet demonstration • 2-of-2 threshold signature
          </p>
          <div class="flex justify-center gap-4 mt-2">
            <a href="/" class="text-cyan-400 text-sm hover:text-cyan-300">
              ← Fast Vault
            </a>
            <a href="/multi-device.html" class="text-indigo-400 text-sm hover:text-indigo-300">
              📱 Real Device Testing →
            </a>
          </div>
        </div>

        <!-- Device Tabs -->
        <div class="flex justify-center mb-6">
          <div class="inline-flex bg-slate-800/50 rounded-lg p-1">
            <button 
              id="tab-device-a"
              class="px-6 py-2 rounded-lg font-medium transition ${
                state.activeDevice === 'device-a'
                  ? 'bg-cyan-500 text-white'
                  : 'text-slate-400 hover:text-white'
              }"
            >
              📱 Device A
              ${state.deviceA.vault ? '<span class="ml-2 text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">Vault</span>' : ''}
            </button>
            <button 
              id="tab-device-b"
              class="px-6 py-2 rounded-lg font-medium transition ${
                state.activeDevice === 'device-b'
                  ? 'bg-cyan-500 text-white'
                  : 'text-slate-400 hover:text-white'
              }"
            >
              📱 Device B
              ${state.deviceB.vault ? '<span class="ml-2 text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">Vault</span>' : ''}
            </button>
          </div>
        </div>

        <!-- Main Content Grid -->
        <div class="grid md:grid-cols-2 gap-6">
          <!-- Active Device Panel -->
          <div class="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6">
            ${renderDevicePanel(getActiveDevice())}
          </div>

          <!-- Status/Info Panel -->
          <div class="space-y-4">
            <!-- Shared Payload Display -->
            ${state.sharedPayload ? `
              <div class="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                <h3 class="text-amber-400 font-medium mb-2">
                  ${state.sharedPayloadType === 'keygen' ? '🔑 Keygen Session Active' : '✍️ Signing Request'}
                </h3>
                <p class="text-slate-400 text-sm mb-3">
                  ${state.sharedPayloadType === 'keygen' 
                    ? 'Switch to Device B and click "Join Vault" to complete the MPC keygen ceremony.'
                    : 'Switch to the other device to approve this transaction.'}
                </p>
                <div class="bg-slate-900/50 rounded-lg p-3 font-mono text-xs text-slate-500 break-all max-h-32 overflow-auto">
                  ${state.sharedPayload.slice(0, 200)}...
                </div>
              </div>
            ` : ''}

            <!-- Pending Transaction -->
            ${state.pendingTransaction ? `
              <div class="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4">
                <h3 class="text-indigo-400 font-medium mb-2">📤 Pending Transaction</h3>
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between">
                    <span class="text-slate-400">From:</span>
                    <span class="text-white">${state.pendingTransaction.fromDevice === 'device-a' ? 'Device A' : 'Device B'}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-slate-400">To:</span>
                    <span class="text-white font-mono text-xs">${state.pendingTransaction.toAddress.slice(0, 20)}...</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-slate-400">Amount:</span>
                    <span class="text-white">${state.pendingTransaction.amount} SOL</span>
                  </div>
                </div>
              </div>
            ` : ''}

            <!-- How It Works -->
            <div class="bg-slate-800/30 rounded-xl p-4">
              <h3 class="text-slate-300 font-medium mb-3">How This Demo Works</h3>
              <ol class="space-y-2 text-sm text-slate-400">
                <li class="flex gap-2">
                  <span class="text-cyan-400">1.</span>
                  Device A creates a secure vault, generating a keygen session
                </li>
                <li class="flex gap-2">
                  <span class="text-cyan-400">2.</span>
                  Device B joins using the session payload (simulated QR)
                </li>
                <li class="flex gap-2">
                  <span class="text-cyan-400">3.</span>
                  Both devices perform MPC keygen via relay server
                </li>
                <li class="flex gap-2">
                  <span class="text-cyan-400">4.</span>
                  Each device gets its own key share - neither has full key
                </li>
                <li class="flex gap-2">
                  <span class="text-cyan-400">5.</span>
                  To sign: one initiates, other approves via MPC signing
                </li>
              </ol>
            </div>

            <!-- Security Info -->
            <div class="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
              <h3 class="text-emerald-400 font-medium mb-2">🔐 Security Model</h3>
              <ul class="space-y-1 text-sm text-slate-400">
                <li>• 2-of-2 threshold: Both devices required to sign</li>
                <li>• DKLS protocol for ECDSA, Schnorr for EdDSA</li>
                <li>• No single point of failure</li>
                <li>• Relay server never sees private keys</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
  
  attachEventListeners()
}

function renderDevicePanel(device: DeviceState): string {
  const isDeviceA = device.id === 'device-a'
  
  // Not initialized
  if (!device.initialized) {
    return `
      <div class="text-center py-8">
        <h2 class="text-xl font-bold text-white mb-4">${device.name}</h2>
        <p class="text-slate-400 mb-6">Initialize the SDK to get started</p>
        <button 
          id="btn-init-${device.id}"
          class="bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-medium px-6 py-3 rounded-lg transition"
          ${device.loading ? 'disabled' : ''}
        >
          ${device.loading ? 'Initializing...' : 'Initialize SDK'}
        </button>
        ${device.error ? `<p class="text-red-400 text-sm mt-4">${device.error}</p>` : ''}
      </div>
    `
  }
  
  // Status badge
  const statusBadge = `
    <div class="mb-4 text-center">
      <span class="text-sm px-3 py-1 rounded-full ${
        device.loading 
          ? 'bg-amber-500/20 text-amber-400' 
          : device.error 
            ? 'bg-red-500/20 text-red-400'
            : device.vault
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-slate-500/20 text-slate-400'
      }">
        ${device.status}
      </span>
    </div>
  `
  
  // Error display
  const errorDisplay = device.error ? `
    <div class="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
      ${device.error}
    </div>
  ` : ''
  
  // No vault - show create/join UI
  if (!device.vault) {
    if (isDeviceA) {
      // Device A can create
      return `
        <div>
          <h2 class="text-xl font-bold text-white mb-4 text-center">${device.name}</h2>
          ${statusBadge}
          ${errorDisplay}
          
          <div class="space-y-4">
            <div>
              <label class="block text-slate-300 text-sm mb-2">Vault Name</label>
              <input
                type="text"
                id="vault-name"
                value="Shared Secure Vault"
                class="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
                ${device.loading ? 'disabled' : ''}
              />
            </div>
            <div>
              <label class="block text-slate-300 text-sm mb-2">Password (optional)</label>
              <input
                type="password"
                id="vault-password"
                placeholder="••••••••"
                class="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
                ${device.loading ? 'disabled' : ''}
              />
            </div>
            <button
              id="btn-create-vault"
              class="w-full bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-medium py-3 rounded-lg transition disabled:opacity-50"
              ${device.loading ? 'disabled' : ''}
            >
              ${device.loading ? 'Creating...' : 'Create Secure Vault'}
            </button>
            
            ${device.qrPayload ? `
              <div class="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p class="text-amber-400 text-sm mb-2">
                  ⏳ Waiting for Device B to join (${device.devicesJoined}/${device.devicesRequired})
                </p>
                <p class="text-slate-400 text-xs">
                  Switch to Device B tab and click "Join Vault"
                </p>
              </div>
            ` : ''}
          </div>
        </div>
      `
    } else {
      // Device B can join
      const canJoin = state.sharedPayload && state.sharedPayloadType === 'keygen'
      return `
        <div>
          <h2 class="text-xl font-bold text-white mb-4 text-center">${device.name}</h2>
          ${statusBadge}
          ${errorDisplay}
          
          ${canJoin ? `
            <div class="space-y-4">
              <div class="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                <p class="text-cyan-400 text-sm">
                  🔗 Keygen session detected! Click below to join.
                </p>
              </div>
              <div>
                <label class="block text-slate-300 text-sm mb-2">Password (same as Device A)</label>
                <input
                  type="password"
                  id="join-password"
                  placeholder="••••••••"
                  class="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
                  ${device.loading ? 'disabled' : ''}
                />
              </div>
              <button
                id="btn-join-vault"
                class="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-medium py-3 rounded-lg transition disabled:opacity-50"
                ${device.loading ? 'disabled' : ''}
              >
                ${device.loading ? 'Joining...' : 'Join Vault'}
              </button>
            </div>
          ` : `
            <div class="text-center py-8">
              <p class="text-slate-400">
                Waiting for Device A to create a vault...
              </p>
              <p class="text-slate-500 text-sm mt-2">
                Switch to Device A tab to initiate vault creation
              </p>
            </div>
          `}
        </div>
      `
    }
  }
  
  // Check if there's a pending transaction from the OTHER device that this device needs to approve
  const canApprove = state.pendingTransaction && state.pendingTransaction.fromDevice !== device.id
  
  // Has vault - show wallet UI
  return `
    <div>
      <h2 class="text-xl font-bold text-white mb-4 text-center">${device.name}</h2>
      ${statusBadge}
      ${errorDisplay}
      
      <!-- Approval Request Banner -->
      ${canApprove ? `
        <div class="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <h3 class="text-amber-400 font-medium mb-2">⚠️ Approval Required</h3>
          <p class="text-slate-300 text-sm mb-3">
            ${state.pendingTransaction!.fromDevice === 'device-a' ? 'Device A' : 'Device B'} wants to send:
          </p>
          <div class="bg-slate-900/50 rounded-lg p-3 mb-3 space-y-1 text-sm">
            <div class="flex justify-between">
              <span class="text-slate-400">Amount:</span>
              <span class="text-white font-medium">${state.pendingTransaction!.amount} SOL</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-400">To:</span>
              <span class="text-white font-mono text-xs">${state.pendingTransaction!.toAddress.slice(0, 20)}...</span>
            </div>
          </div>
          <button
            id="btn-approve-${device.id}"
            class="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-medium py-3 rounded-lg transition disabled:opacity-50"
            ${device.loading ? 'disabled' : ''}
          >
            ${device.loading ? 'Signing...' : '✓ Approve & Sign'}
          </button>
          <button
            id="btn-reject-${device.id}"
            class="w-full mt-2 text-red-400 hover:text-red-300 text-sm py-2"
            ${device.loading ? 'disabled' : ''}
          >
            ✗ Reject
          </button>
        </div>
      ` : ''}
      
      <!-- Wallet Info -->
      <div class="bg-slate-900/50 rounded-xl p-4 mb-4">
        <div class="flex items-center justify-between mb-3">
          <span class="text-slate-400 text-sm">Solana Address</span>
          <button id="btn-copy-${device.id}" class="text-cyan-400 text-xs hover:text-cyan-300">
            Copy
          </button>
        </div>
        <p class="font-mono text-sm text-white break-all">
          ${device.solanaAddress}
        </p>
      </div>
      
      <!-- Balance -->
      <div class="text-center mb-6">
        <p class="text-slate-400 text-sm mb-1">Balance</p>
        <p class="text-3xl font-bold text-white">
          ${device.balance !== null ? device.balance.toFixed(6) : '—'}
          <span class="text-lg text-slate-400">SOL</span>
        </p>
        <button id="btn-refresh-${device.id}" class="text-cyan-400 text-sm mt-2 hover:text-cyan-300">
          Refresh
        </button>
      </div>
      
      <!-- Explorer Link -->
      <a
        href="https://solscan.io/account/${device.solanaAddress}"
        target="_blank"
        rel="noopener noreferrer"
        class="block text-center text-sm text-indigo-400 hover:text-indigo-300 mb-6"
      >
        View on Solscan ↗
      </a>
      
      <!-- Transaction Form (hidden if there's a pending approval) -->
      ${!canApprove ? `
        <div class="border-t border-slate-700 pt-6 space-y-4">
          <h3 class="text-white font-medium">Send SOL</h3>
          <div>
            <label class="block text-slate-300 text-sm mb-2">Destination Address</label>
            <input
              type="text"
              id="tx-destination"
              placeholder="Solana address..."
              class="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition text-sm font-mono"
              ${device.loading ? 'disabled' : ''}
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
              ${device.loading ? 'disabled' : ''}
            />
          </div>
          <button
            id="btn-send-${device.id}"
            class="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-medium py-3 rounded-lg transition disabled:opacity-50"
            ${device.loading ? 'disabled' : ''}
          >
            ${device.loading ? 'Processing...' : 'Initiate Transaction'}
          </button>
          <p class="text-slate-500 text-xs text-center">
            Other device will need to approve
          </p>
        </div>
      ` : ''}
      
      <!-- Delete Vault -->
      <div class="mt-6 pt-4 border-t border-slate-700">
        <button
          id="btn-delete-${device.id}"
          class="w-full text-red-400 hover:text-red-300 text-sm py-2"
          ${device.loading ? 'disabled' : ''}
        >
          Delete Vault from This Device
        </button>
      </div>
    </div>
  `
}

function attachEventListeners(): void {
  // Tab switching
  document.getElementById('tab-device-a')?.addEventListener('click', () => {
    state.activeDevice = 'device-a'
    render()
  })
  
  document.getElementById('tab-device-b')?.addEventListener('click', () => {
    state.activeDevice = 'device-b'
    render()
  })
  
  // Initialize buttons
  document.getElementById('btn-init-device-a')?.addEventListener('click', () => initializeDevice('device-a'))
  document.getElementById('btn-init-device-b')?.addEventListener('click', () => initializeDevice('device-b'))
  
  // Create vault
  document.getElementById('btn-create-vault')?.addEventListener('click', createSecureVault)
  
  // Join vault
  document.getElementById('btn-join-vault')?.addEventListener('click', joinSecureVault)
  
  // Send transactions
  document.getElementById('btn-send-device-a')?.addEventListener('click', () => initiateTransaction('device-a'))
  document.getElementById('btn-send-device-b')?.addEventListener('click', () => initiateTransaction('device-b'))
  
  // Copy address
  document.getElementById('btn-copy-device-a')?.addEventListener('click', () => {
    if (state.deviceA.solanaAddress) {
      navigator.clipboard.writeText(state.deviceA.solanaAddress)
    }
  })
  document.getElementById('btn-copy-device-b')?.addEventListener('click', () => {
    if (state.deviceB.solanaAddress) {
      navigator.clipboard.writeText(state.deviceB.solanaAddress)
    }
  })
  
  // Refresh balance
  document.getElementById('btn-refresh-device-a')?.addEventListener('click', async () => {
    if (state.deviceA.solanaAddress) {
      const balance = await fetchBalance(state.deviceA.solanaAddress)
      setDeviceState('device-a', { balance })
      render()
    }
  })
  document.getElementById('btn-refresh-device-b')?.addEventListener('click', async () => {
    if (state.deviceB.solanaAddress) {
      const balance = await fetchBalance(state.deviceB.solanaAddress)
      setDeviceState('device-b', { balance })
      render()
    }
  })
  
  // Delete vault
  document.getElementById('btn-delete-device-a')?.addEventListener('click', () => deleteVault('device-a'))
  document.getElementById('btn-delete-device-b')?.addEventListener('click', () => deleteVault('device-b'))
  
  // Approve transaction
  document.getElementById('btn-approve-device-a')?.addEventListener('click', () => approveTransaction('device-a'))
  document.getElementById('btn-approve-device-b')?.addEventListener('click', () => approveTransaction('device-b'))
  
  // Reject transaction
  document.getElementById('btn-reject-device-a')?.addEventListener('click', () => rejectTransaction())
  document.getElementById('btn-reject-device-b')?.addEventListener('click', () => rejectTransaction())
}

// Initialize app
async function init(): Promise<void> {
  render()
  
  // Auto-initialize both devices
  await Promise.all([
    initializeDevice('device-a'),
    initializeDevice('device-b'),
  ])
}

init()
