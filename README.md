# Unicity Agent-to-Agent Service

> Two autonomous agents. One offers data enrichment, the other discovers and pays for it. No human in the loop.

Built for the [Unicity Sphere Builder Campaign](https://x.com/unicity_labs/status/2071580950069207222) — 4-week call to build the first real apps and agents on the network.

## What This Does

| Agent | Nametag | Role | What It Does |
|---|---|---|---|
| **Agent A** | `@enricher` | Service Provider | Registers nametag, publishes service intent to market, listens for DMs, fulfils data requests, delivers results |
| **Agent B** | `@scout` | Service Consumer | Self-mints test tokens, searches market for services, sends payment + task via DM, receives enriched result |

### The Flow

```
Agent A boots → registers @enricher → publishes "data-enricher" intent
                                              ↓
Agent B boots → self-mints 5 UCT → searches market → finds @enricher
                                              ↓
Agent B → DM: { task: "lookup", data: {...} } + 1 UCT payment → Agent A
                                              ↓
Agent A → receives payment → runs enrichment → DMs result back to @scout
                                              ↓
Agent B → receives enriched data → logs result → done
```

### SDK Primitives Used

- **Payments** — v2 send/receive (sender-driven, certified on-chain, mailbox delivery)
- **DMs** — NIP-17 direct messages for service negotiation
- **Intents** — Signed intent bulletin board (market) for service discovery
- **Nametags** — Human-readable identity (@enricher, @scout)
- **Self-mint** — Test token generation on testnet2
- **Wallet** — BIP39/BIP32 HD wallet with v2 wallet-api composition

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
git clone <repo>
cd unicity-agent2agent
npm install
cp .env.example .env
```

Edit `.env` with your config. The testnet2 oracle key is public (not a secret).

### First Run

Each agent creates its own wallet on first boot. The mnemonic is printed to the console — **save it**.

```bash
# Terminal 1 — Start Agent A (provider)
npm run agent-a

# Terminal 2 — Start Agent B (consumer)
npm run agent-b
```

Or run both in one terminal (demo mode):

```bash
npm run demo
```

## How It Works

### Agent A (Service Provider)

1. Boots Sphere wallet on testnet2
2. Registers `@enricher` nametag
3. Self-mints test tokens for operations
4. Publishes "data-enricher" service intent to the market
5. Listens for incoming DMs
6. When a DM with a service request + payment arrives:
   - Parses the request (`{ task, data }`)
   - Runs the enrichment function
   - DMs the result back to the sender
7. Loops — stays alive for more requests

### Agent B (Service Consumer)

1. Boots Sphere wallet on testnet2
2. Self-mints 5 UCT for spending
3. Searches the intent market for "data-enricher"
4. Sends a service request + 1 UCT payment via DM
5. Listens for the enriched result
6. Logs the result and stays alive

### Service Tasks

The enrichment service supports three task types:

| Task | Input | Output |
|---|---|---|
| `lookup` | `{ query: string }` | Status, confidence, source |
| `score` | `{ entity: string }` | Score (0-100), risk level |
| `verify` | `{ claim: string }` | Verified boolean, method |

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Unicity Testnet2                       │
│                                                          │
│  ┌─────────────┐    DM + Payment    ┌─────────────┐     │
│  │  Agent A    │◄──────────────────│  Agent B    │     │
│  │  @enricher  │──────────────────►│  @scout     │     │
│  │             │    DM: result      │             │     │
│  └──────┬──────┘                   └──────┬──────┘     │
│         │                                 │             │
│  ┌──────▼──────┐                   ┌──────▼──────┐     │
│  │ Sphere SDK  │                   │ Sphere SDK  │     │
│  │ + wallet-api│                   │ + wallet-api│     │
│  └──────┬──────┘                   └──────┬──────┘     │
│         │                                 │             │
│  ┌──────▼──────┐                   ┌──────▼──────┐     │
│  │ Intent      │                   │ Market      │     │
│  │ Market      │◄──────────────────│ Search      │     │
│  └─────────────┘                   └─────────────┘     │
│                                                          │
│  Gateway: gateway.testnet2.unicity.network               │
│  Wallet-API: wallet-api.unicity.network                  │
│  Nostr Relay: nostr-relay.testnet.unicity.network        │
└──────────────────────────────────────────────────────────┘
```

## Project Structure

```
unicity-agent2agent/
├── src/
│   ├── shared.ts        # Config, env vars, types
│   ├── service.ts       # Data enrichment logic (pure functions)
│   ├── agent-a.ts       # Service provider (autonomous loop)
│   └── agent-b.ts       # Service consumer (autonomous loop)
├── data/                # Wallet + token storage (gitignored)
├── .env.example         # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

## Judging Criteria Alignment

| Dimension | How This Build Addresses It |
|---|---|
| **Depth of SDK use** | Payments (v2 send/receive), DMs (NIP-17), Intents (market), Nametags, Self-mint, Wallet composition |
| **Autonomy** | Both agents run fully autonomous loops — no human clicks after boot |
| **Usefulness** | Demonstrates a real agent-to-agent economic pattern: service discovery → payment → fulfilment → delivery |
| **Completeness** | Error handling, README, run instructions, clean structure |
| **Network contribution** | Agent A publishes intents other agents can find; exposes a service other agents can transact with |

## Bonuses

- [x] **Agentic (+1000 XP)** — Both agents drive economic action autonomously
- [ ] **AstridOS (+500 XP)** — TODO: package as Astrid capsule

## License

MIT
