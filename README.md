# Vultisig SDK Demo

A **100% client-side** demo of the Vultisig SDK, showcasing MPC (Multi-Party Computation) wallet functionality on Solana.

## Features

- 📱 **Multi-Device Vaults** - Create vaults with the Vultisig mobile app (2-of-2 or 2-of-3)
- 🔐 **Fast Vaults** - 2-of-2 MPC wallet with email verification (no mobile app needed)
- 💰 **View Balance** - Real-time SOL balance from Solana mainnet
- 📤 **Send SOL** - Transfer SOL to any Solana address
- 📦 **Import Vaults** - Import existing `.vult` backup files
- 🔓 **Unlock Vaults** - Access previously created vaults from browser storage

---

## Multi-Device Vault (Secure Vault)

The multi-device demo (`/multi-device.html`) creates **secure vaults** that coordinate between this web app and the [Vultisig mobile app](https://vultisig.com).

### How It Works

Multi-device vaults use real MPC (Multi-Party Computation) where each device holds its own key shard. Both devices must participate in both key generation and transaction signing.

| Component | Location |
|-----------|----------|
| Web Key Shard | Browser IndexedDB |
| Mobile Key Shard | Vultisig Mobile App |
| Coordination | Vultisig Relay Server |

### Vault Creation Flow

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Browser   │         │   Relay     │         │   Mobile    │
│   (Web)     │         │   Server    │         │   App       │
└──────┬──────┘         └──────┬──────┘         └──────┬──────┘
       │                       │                       │
       │  1. Start keygen      │                       │
       │  ──────────────────>  │                       │
       │                       │                       │
       │  2. Display QR code   │                       │
       │  <──────────────────  │                       │
       │                       │                       │
       │                       │   3. Scan QR & join   │
       │                       │  <────────────────────│
       │                       │                       │
       │  4. MPC key generation (DKLS protocol)        │
       │  <───────────────────────────────────────────>│
       │                       │                       │
       │  5. Vault created     │   5. Vault created    │
       │  (shard in IndexedDB) │   (shard in app)      │
       └───────────────────────┴───────────────────────┘
```

1. **User initiates vault creation** in the browser with a name and optional password
2. **SDK generates a QR code** containing session info and encryption key
3. **User scans QR** with Vultisig mobile app to join the keygen session
4. **MPC key generation** runs between both devices via the relay server
5. **Both devices store their key shard** independently - the full key is never assembled

### Transaction Signing Flow

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Browser   │         │   Relay     │         │   Mobile    │
│   (Web)     │         │   Server    │         │   App       │
└──────┬──────┘         └──────┬──────┘         └──────┬──────┘
       │                       │                       │
       │  1. Prepare TX        │                       │
       │  ──────────────────>  │                       │
       │                       │                       │
       │  2. Display QR        │                       │
       │  (TX details)         │                       │
       │                       │                       │
       │                       │   3. Scan & verify TX │
       │                       │  <────────────────────│
       │                       │                       │
       │  4. MPC signing (threshold signatures)        │
       │  <───────────────────────────────────────────>│
       │                       │                       │
       │  5. Broadcast signed TX to Solana             │
       │  ─────────────────────────────────────────────>
       └───────────────────────────────────────────────┘
```

1. **User initiates send** in the browser with destination and amount
2. **SDK prepares transaction** and generates a QR code with signing session
3. **User scans QR** with mobile app to review and approve the transaction
4. **MPC signing** creates a valid signature without reconstructing the private key
5. **Transaction is broadcast** to the Solana network

### Device Configurations

| Config | Threshold | Description |
|--------|-----------|-------------|
| 2-of-2 | Both required | Web + Mobile must both sign |
| 2-of-3 | Any 2 of 3 | Web + 2 Mobile devices, any 2 can sign |

### Security Benefits

- **True self-custody** - No single device holds the complete key
- **Phishing resistant** - Mobile app shows TX details for verification
- **No seed phrase** - Key shards are generated via MPC, not derived from a mnemonic
- **Encrypted relay** - Communication between devices is end-to-end encrypted

---

## Fast Vault

The fast vault demo (`/index.html`) creates vaults using VultiServer as the second party (no mobile app required).

### Architecture

| Component | Location |
|-----------|----------|
| Vultisig SDK | Browser (WASM) |
| Your Key Shard | Browser IndexedDB |
| VultiServer's Key Shard | VultiServer (cloud) |
| Transaction Signing | MPC between browser ↔ VultiServer |

### How It Works

1. User enters email, password, and wallet name
2. SDK initiates 2-of-2 MPC key generation with VultiServer
3. Email verification code is sent
4. User enters code to complete vault creation
5. Key shard is stored in browser's IndexedDB

**No mobile app required** - VultiServer acts as the second signing party.

---

## General Architecture

Both demos run entirely in the browser - **no backend server required**.

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

## Transaction Signing (Both Vault Types)

1. SDK prepares the transaction payload
2. MPC signing session initiated between browser and second party
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
