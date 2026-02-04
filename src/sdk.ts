import { Vultisig } from '@vultisig/sdk'
import type { FastVault } from '@vultisig/sdk'

let sdkInstance: Vultisig | null = null

/**
 * Password cache TTL in milliseconds (5 minutes)
 */
const PASSWORD_CACHE_TTL = 5 * 60 * 1000

/**
 * Initialize the Vultisig SDK with browser-specific configuration
 */
export async function initializeSDK(): Promise<Vultisig> {
  if (sdkInstance) {
    return sdkInstance
  }

  console.log('Initializing Vultisig SDK...')
  
  // Initialize SDK with instance-scoped configuration
  // Storage defaults to BrowserStorage in browser environment
  sdkInstance = new Vultisig({
    passwordCache: {
      defaultTTL: PASSWORD_CACHE_TTL,
    },
    onPasswordRequired: async (vaultId: string, vaultName?: string) => {
      // This will be called when a vault needs to be unlocked
      const displayName = vaultName || vaultId.slice(0, 8)
      const password = window.prompt(`Enter password for vault: ${displayName}`)
      
      if (!password) {
        throw new Error('Password required')
      }
      
      return password
    },
  })
  
  console.log('Loading WASM modules...')
  await sdkInstance.initialize()
  console.log('SDK initialized successfully!')
  
  return sdkInstance
}

/**
 * Get the initialized SDK instance
 */
export function getSDK(): Vultisig {
  if (!sdkInstance) {
    throw new Error('SDK not initialized. Call initializeSDK() first.')
  }
  return sdkInstance
}

/**
 * Create a Fast Vault
 */
export async function createFastVault(
  name: string,
  email: string,
  password: string
): Promise<string> {
  const sdk = getSDK()
  
  console.log('Creating Fast Vault...')
  const vaultId = await sdk.createFastVault({
    name,
    email,
    password,
  })
  
  console.log('Vault creation initiated, vaultId:', vaultId)
  return vaultId
}

/**
 * Verify a vault with email code
 */
export async function verifyVault(
  vaultId: string,
  code: string
): Promise<FastVault> {
  const sdk = getSDK()
  
  console.log('Verifying vault...')
  const vault = await sdk.verifyVault(vaultId, code)
  
  console.log('Vault verified successfully!')
  return vault as FastVault
}

/**
 * Get address for a chain
 */
export async function getAddress(vault: FastVault, chain: string): Promise<string> {
  return vault.address(chain)
}

/**
 * Prepare and send a transaction
 */
export async function sendTransaction(
  vault: FastVault,
  toAddress: string,
  amount: string,
  chain: string = 'Solana'
): Promise<string> {
  const senderAddress = await vault.address(chain)
  const decimals = chain === 'Solana' ? 9 : 18
  const ticker = chain === 'Solana' ? 'SOL' : 'ETH'
  
  const amountFloat = parseFloat(amount)
  const amountBaseUnits = BigInt(Math.floor(amountFloat * Math.pow(10, decimals)))
  
  console.log(`Preparing to send ${amountFloat} ${ticker} to ${toAddress}`)
  
  const coin = {
    chain,
    address: senderAddress,
    decimals,
    ticker,
  }
  
  // Prepare the transaction
  console.log('Preparing transaction...')
  const keysignPayload = await vault.prepareSendTx({
    coin,
    receiver: toAddress,
    amount: amountBaseUnits,
  })
  
  // Extract message hashes
  console.log('Extracting message hashes...')
  const messageHashes = await vault.extractMessageHashes(keysignPayload)
  console.log(`Got ${messageHashes.length} message hash(es)`)
  
  // Sign the transaction
  console.log('Signing transaction...')
  const signature = await vault.sign({
    transaction: keysignPayload,
    chain,
    messageHashes,
  })
  
  // Broadcast the transaction
  console.log('Broadcasting transaction...')
  const txHash = await vault.broadcastTx({
    chain,
    keysignPayload,
    signature,
  })
  
  console.log('Transaction sent:', txHash)
  return txHash
}

/**
 * Vault summary for listing
 */
export interface VaultSummary {
  id: string
  name: string
  type: string
  createdAt: number
}

/**
 * List all vaults in storage
 */
export async function listVaults(): Promise<VaultSummary[]> {
  const sdk = getSDK()
  const vaults = await sdk.listVaults()
  return vaults.map(v => ({
    id: v.id,
    name: v.name,
    type: v.type,
    createdAt: v.createdAt,
  }))
}

/**
 * Get a vault by ID (unlocks it)
 */
export async function getVaultById(id: string): Promise<FastVault> {
  const sdk = getSDK()
  const vault = await sdk.getVaultById(id)
  if (!vault) {
    throw new Error('Vault not found')
  }
  return vault as FastVault
}

/**
 * Check if a vault file is encrypted
 */
export async function isVaultFileEncrypted(file: Blob): Promise<boolean> {
  const sdk = getSDK()
  const content = await file.text()
  return sdk.isVaultEncrypted(content)
}

/**
 * Import a vault from a .vult file
 */
export async function importVault(file: Blob, password?: string): Promise<FastVault> {
  const sdk = getSDK()
  const content = await file.text()
  const vault = await sdk.importVault(content, password)
  return vault as FastVault
}
