# ChainCFO 🤖💰
### AI-Powered Multi-Protocol Treasury Optimizer with Compliance Rails
*Chainlink Convergence Hackathon 2026 — DeFi & Tokenization Track*

![Solidity](https://img.shields.io/badge/Solidity-0.8.24-blue?logo=solidity)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)
![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![Chainlink](https://img.shields.io/badge/Chainlink-CRE-375BD2?logo=chainlink)

---

## What It Does

ChainCFO is an autonomous DeFi treasury manager that uses Chainlink's Compute Runtime Environment (CRE) to continuously optimise stablecoin yield across multiple lending protocols. Every four hours — or immediately when governance changes — a 10-step TypeScript workflow fetches live APYs from Aave, Compound, and Morpho, scores protocol risk via Credora's Confidential HTTP endpoint, and prompts Gemini 1.5 Pro to generate an optimal allocation strategy. The resulting decision is validated against on-chain governance policy before being executed across chains via CCIP.

Every allocation decision, LLM rationale, and compliance violation is stored immutably on-chain inside `TreasuryVault`. Depositors receive proportional vault shares and can monitor real-time performance through a Next.js dashboard. Governance participants propose and vote on policy parameters; when a proposal passes, the `GovernanceVoteExecuted` event fires the CRE EVM Log Trigger — making governance changes instantly effective without any manual intervention.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ChainCFO System                             │
│                                                                     │
│  ┌─────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │  Next.js 14 │    │  Express Backend  │    │  Smart Contracts  │  │
│  │  Frontend   │◄──►│  API + Indexer   │◄──►│  TreasuryVault   │  │
│  │  (Wagmi v2) │    │  Prisma + Prom.  │    │  GovernancePolicy│  │
│  └─────────────┘    └──────────────────┘    │  CCIPReceiver    │  │
│                                              └────────┬─────────┘  │
│                                                       │            │
│  ┌────────────────────────────────────────────────────▼──────────┐ │
│  │                   Chainlink CRE Workflow                      │ │
│  │  1. getPolicy()  2. interval?  3. pegCheck  4. fetchAPYs     │ │
│  │  5. Credora risk  6. PoR check  7. Gemini LLM rank           │ │
│  │  8. compliance?  9. CCIP exec  10. rebalance audit           │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                        │           │                               │
│              ┌─────────▼──┐  ┌─────▼──────┐                      │
│              │    Aave v2  │  │ Compound v2│  ← yield sources     │
│              └────────────┘  └────────────┘                      │
│                        │                                           │
│              ┌─────────▼──────────┐                               │
│              │   Morpho Blue      │  ← cross-chain via CCIP       │
│              └────────────────────┘                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Chainlink Services

| Service | How Used |
|---|---|
| **CRE (TypeScript)** | Main 10-step orchestration workflow — runs every 4h + on governance event |
| **CCIP** | Cross-chain stablecoin rebalancing from Sepolia → Arbitrum Sepolia |
| **Data Feeds (USDC/USD)** | Peg guard before every rebalance (aborts if price < 0.995 or > 1.005) |
| **Confidential HTTP** | Credora risk API key is never exposed — stays encrypted in CRE |
| **Proof of Reserve** | Protocol TVL on-chain verification (optional, controlled by governance) |
| **EVM Log Trigger** | `GovernanceVoteExecuted` event fires CRE rebalance immediately |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.24, Hardhat, OpenZeppelin 5, Chainlink CCIP |
| CRE Workflow | TypeScript, Chainlink CRE WASM runtime |
| Backend | Express.js, Prisma ORM, PostgreSQL, ethers.js v6 |
| Frontend | Next.js 14 App Router, Wagmi v2, RainbowKit v2, Recharts |
| Infrastructure | Docker Compose, Redis, Prometheus metrics |

---

## Quick Start

### Prerequisites
- Node.js 20+, Docker & Docker Compose
- Sepolia RPC URL (e.g. Alchemy / Infura)
- Gemini API key (free tier)

### 1. Clone & Configure

```bash
git clone https://github.com/UncleTom29/ChainCFO.git
cd ChainCFO
cp .env.example .env
# Fill in your values in .env
```

### 2. Deploy Contracts

```bash
cd packages/contracts
npm install
npx hardhat run scripts/deploy.ts --network sepolia
```

### 3. Start Services

```bash
# From repo root
docker-compose up -d
```

Access:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Metrics: http://localhost:3001/metrics

### 4. Register CRE Workflow

1. Build the workflow: `cd packages/cre-workflow && npm run build`
2. Visit https://cre.chain.link
3. Upload `packages/cre-workflow/workflow.yaml` + `dist/`
4. Set `GEMINI_API_KEY` and `CREDORA_API_KEY` as CRE secrets

### 5. All-in-One Deploy

```bash
source .env && bash scripts/deploy-all.sh
```

---

## Development

```bash
# Install all workspace dependencies
npm install

# Run backend + frontend in watch mode
npm run dev

# Run contract tests
npm run test -w contracts

# Run CRE workflow tests
npm run test -w cre-workflow
```

---

## Live Demo

🔗 **Live App**: _coming soon_
🎥 **Video Demo**: _coming soon_

---

## Team

Built for the Chainlink Convergence Hackathon 2026 — DeFi & Tokenization Track.
