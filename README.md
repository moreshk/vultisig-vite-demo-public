# Vultisig Fast Vault Demo

A **100% client-side** demo of the Vultisig SDK, showcasing MPC (Multi-Party Computation) wallet functionality on Solana.

## Features

- 🔐 **Create Fast Vaults** - 2-of-2 MPC wallet with email verification
- 💰 **View Balance** - Real-time SOL balance from Solana mainnet
- 📤 **Send SOL** - Transfer SOL to any Solana address
- 📦 **Import Vaults** - Import existing `.vult` backup files
- 🔓 **Unlock Vaults** - Access previously created vaults from browser storage

## Architecture

This demo runs entirely in the browser:

| Component | Location |
|-----------|----------|
| Vultisig SDK | Browser (WASM) |
| Your Key Shard | Browser IndexedDB |
| Vultisig's Key Shard | VultiServer (cloud) |
| Transaction Signing | MPC between browser ↔ VultiServer |

**No backend server required** - it's a true client-side dApp!

## Tech Stack

- **Vite** - Build tool
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **@vultisig/sdk** - Vultisig SDK v0.4.1
- **WASM** - WebAssembly modules for cryptography

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/vultisig-vite-demo.git
cd vultisig-vite-demo

# Install dependencies
npm install

# Start dev server
npm run dev
```

### Build

```bash
npm run build
```

The build output will be in the `dist/` folder.

## How It Works

### Fast Vault Creation

1. User enters email, password, and wallet name
2. SDK initiates 2-of-2 MPC key generation with VultiServer
3. Email verification code is sent
4. User enters code to complete vault creation
5. Key shard is stored in browser's IndexedDB

### Transaction Signing

1. SDK prepares the transaction payload
2. MPC signing session initiated between browser and VultiServer
3. Both parties contribute to the signature without revealing their key shares
4. Signed transaction is broadcast to Solana

## Security

- **No single point of failure** - Private key is never reconstructed
- **Self-custodial** - You control your key shard
- **MPC/TSS** - Threshold signature scheme ensures security
- **Browser storage** - Key shard encrypted in IndexedDB

## Resources

- [Vultisig SDK Documentation](https://docs.vultisig.com/developer-docs/vultisig-sdk)
- [Vultisig Website](https://vultisig.com)
- [SDK npm package](https://www.npmjs.com/package/@vultisig/sdk)

## License

MIT
