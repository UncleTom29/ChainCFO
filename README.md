# ChainCFO

AI-powered, policy-constrained DeFi treasury management across protocols and chains.

ChainCFO combines:
- **On-chain vault + governance contracts** (Solidity / Hardhat)
- **Automated decision workflow** on **Chainlink CRE** (TypeScript)
- **Execution + analytics backend** (Express + Prisma + Postgres)
- **Operator + investor UI** (Next.js + Wagmi + RainbowKit)

The system continuously evaluates yield opportunities (Aave / Compound / Morpho), applies governance constraints, checks safety rails (peg + optional PoR), then writes auditable allocation decisions on-chain.

---

## Table of Contents

- [1. What ChainCFO Does](#1-what-chaincfo-does)
- [2. High-Level Architecture](#2-high-level-architecture)
- [3. Repository Layout](#3-repository-layout)
- [4. Technology Stack](#4-technology-stack)
- [5. Core Components](#5-core-components)
- [6. Smart Contracts](#6-smart-contracts)
- [7. CRE Workflow](#7-cre-workflow)
- [8. Backend API](#8-backend-api)
- [9. Database Model](#9-database-model)
- [10. Environment Variables](#10-environment-variables)
- [11. Quick Start (Docker)](#11-quick-start-docker)
- [12. Local Development (Non-Docker)](#12-local-development-non-docker)
- [13. Deployment Runbook](#13-deployment-runbook)
- [14. Testing](#14-testing)
- [15. Monitoring & Operations](#15-monitoring--operations)
- [16. Security Notes](#16-security-notes)
- [17. Deployed Addresses](#17-deployed-addresses)
- [18. Chainlink Usage](#18-chainlink-usage)
- [19. Troubleshooting](#17-troubleshooting)

---

## 1. What ChainCFO Does

ChainCFO acts as an autonomous “treasury CFO” for stablecoin capital:

1. Reads current governance policy on-chain.
2. Fetches protocol data (APY + TVL) from market sources.
3. Scores risk by protocol.
4. Validates safety conditions (stablecoin peg, optional proof-of-reserve freshness).
5. Generates allocation suggestions with an LLM (with deterministic fallback).
6. Verifies allocations against governance constraints.
7. Emits a signed report and executes rebalance into `TreasuryVault`.
8. Persists outcomes/events for dashboard analytics and auditability.

Triggers:
- **Cron** every 4 hours
- **Governance event trigger** when a policy vote is executed

---

## 2. High-Level Architecture

```mermaid
flowchart LR
  subgraph UI[Frontend - Next.js]
    D[Dashboard]
    G[Governance]
  end

  subgraph API[Backend - Express + Prisma]
    TAPI[/Treasury APIs/]
    AAPI[/Analytics APIs/]
    IDX[Event Indexer]
  end

  subgraph CHAIN[Sepolia Contracts]
    TV[TreasuryVault]
    GP[GovernancePolicy]
    CR[CCIP Receiver]
  end

  subgraph CRE[Chainlink CRE Workflow]
    W1[Fetch market data]
    W2[Risk + policy checks]
    W3[LLM ranking]
    W4[Compliance validation]
    W5[writeReport to Vault]
  end

  subgraph DATA[(Postgres)]
    AR[AllocationReport]
    TE[TreasuryEvent]
    U[User]
  end

  D --> TAPI
  D --> AAPI
  G --> GP
  TAPI --> TV
  AAPI --> DATA
  IDX --> CHAIN
  IDX --> DATA
  CRE --> GP
  CRE --> TV
  TV --> IDX
  GP --> CRE
```

---

## 3. Repository Layout

```text
.
├── docker-compose.yml
├── package.json                  # Root workspace scripts
├── scripts/
│   └── deploy-all.sh             # End-to-end deployment helper
└── packages/
    ├── contracts/                # Solidity + Hardhat
    ├── backend/                  # Express API + Prisma + indexer
    ├── frontend/                 # Next.js app (dashboard + governance)
    ├── cre-workflow/             # Chainlink CRE TypeScript workflow
    ├── predict-market/           # Separate prediction workflow module
    ├── cre-test/                 # CRE test project artifacts
    └── temp-cre/                 # Temporary CRE project artifacts
```

---

## 4. Technology Stack

### On-chain
- Solidity `0.8.26`
- Hardhat + TypeScript
- OpenZeppelin Contracts
- Chainlink CCIP contracts

### Off-chain runtime
- Chainlink CRE SDK
- Bun (workflow build/test commands)
- HTTP / Confidential HTTP / EVM Read / EVM Write capabilities

### Backend
- Node.js + Express
- Prisma ORM
- PostgreSQL
- Prometheus metrics (`prom-client`)
- Ethers v6 (contract reads + event subscriptions)

### Frontend
- Next.js 14 (App Router)
- React Query
- Wagmi v2 + RainbowKit
- Recharts
- Tailwind CSS

---

## 5. Core Components

### `packages/contracts`
Defines core protocol primitives:
- `TreasuryVault.sol`
- `GovernancePolicy.sol`
- `ChainCFOCCIPReceiver.sol`

### `packages/cre-workflow`
Implements autonomous rebalance logic and trigger handlers.

### `packages/backend`
Provides:
- Read APIs for dashboard and governance analytics
- Transaction payload builders for deposit/withdraw UX
- Event indexer writing chain events into Postgres
- Health and metrics endpoints

### `packages/frontend`
Provides:
- Landing page
- Dashboard with KPIs/charts/history/AI rationale
- Governance page for viewing current policy + proposing new policy

---

## 6. Smart Contracts

### `TreasuryVault`
Purpose:
- Accepts stablecoin deposits
- Mints proportional vault shares
- Handles withdrawals with slippage guard
- Stores rebalance reports + LLM rationale

Key features:
- `deposit(amount)`
- `withdraw(shares, minAmountOut)`
- `onReport(bytes report)` callable by authorized CRE caller
- Circuit breaker: pauses if reported TVL drops below 80% of previous report
- Owner controls: pause/unpause, set CRE caller, set max protocols

### `GovernancePolicy`
Purpose:
- On-chain control of risk/allocation parameters
- Governor voting + execution

Policy fields:
- `maxAllocationBps`
- `minLiquidityBufferBps`
- `maxProtocols`
- `rebalanceIntervalSecs`
- `requireProofOfReserve`

Critical event:
- `GovernanceVoteExecuted` (used as CRE EVM log trigger)

### `ChainCFOCCIPReceiver`
Purpose:
- Receives cross-chain CCIP messages
- Deposits incoming stablecoin into target destination protocol adapters

---

## 7. CRE Workflow

Source: `packages/cre-workflow/src/workflow.ts`

Configured triggers (`workflow.yaml`):
- Cron: `0 */4 * * *`
- EVM log: `GovernanceVoteExecuted(uint256,tuple)` on configured governance contract

Pipeline behavior:
1. Fetch current governance policy by `getPolicy()`.
2. Verify stablecoin parity via Chainlink Data Feed (`latestRoundData`).
3. Fetch APY/TVL snapshots (Aave, Compound, Morpho).
4. Compute risk scores.
5. Optionally run PoR freshness checks if policy requires it.
6. Ask LLM for allocation plan constrained by policy bounds.
7. Validate resulting allocation plan in deterministic compliance checks.
8. Encode and submit report to vault using CRE `writeReport` flow.

Fallback behavior:
- If LLM call fails/unparseable, workflow uses equal-distribution fallback within policy constraints.

CRE runtime config keys (`config.json`):
- `schedule`
- `governanceContract`
- `feedAddress`
- `treasuryVaultAddress`

---

## 8. Backend API

Base URL default:
- `http://localhost:3001`

### Health + observability
- `GET /health` → service health (Postgres + RPC config)
- `GET /metrics` → Prometheus metrics

### Treasury
- `GET /api/treasury/stats`
  - TVL
  - shares
  - current allocations
  - last/next rebalance timestamps
- `GET /api/treasury/history?limit=10`
- `GET /api/treasury/user/:address`
- `POST /api/treasury/deposit`
  - returns calldata payload for frontend tx flow
- `POST /api/treasury/withdraw`
  - returns calldata payload for frontend tx flow

### Analytics
- `GET /api/analytics/apy-history?days=30`
- `GET /api/analytics/protocol-breakdown`
- `GET /api/analytics/llm-decisions?limit=5`
- `GET /api/analytics/compliance-events`

Response envelope pattern:
```json
{
  "success": true,
  "data": {},
  "timestamp": 1710000000000
}
```

---

## 9. Database Model

Prisma schema (`packages/backend/prisma/schema.prisma`) includes:

- `AllocationReport`
  - Stores rebalance snapshots and LLM rationale
- `AllocationEntry`
  - Per-protocol allocation rows linked to report
- `TreasuryEvent`
  - Indexed on-chain events (deposit, withdrawal, governance, compliance)
- `User`
  - Lightweight user share/deposit record

---

## 10. Environment Variables

ChainCFO reads most settings from root `.env` (loaded by backend/contracts tooling).

### Required for contract deploy and workflow operations
- `PRIVATE_KEY` — deployer/admin EOA private key
- `SEPOLIA_RPC_URL` — Sepolia RPC endpoint
- `ARBITRUM_SEPOLIA_RPC_URL` — Arbitrum Sepolia RPC endpoint
- `CCIP_ROUTER_SEPOLIA` — CCIP router address on Sepolia
- `CCIP_ROUTER_ARBITRUM` — CCIP router address on Arbitrum Sepolia
- `CHAINLINK_DATA_FEED_USDC_USD` — USDC/USD feed address
- `GEMINI_API_KEY` — required by `scripts/deploy-all.sh` validation (legacy naming in script)
- `DATABASE_URL` — Prisma Postgres connection string

### Frontend / backend integration
- `NEXT_PUBLIC_API_URL` — frontend API base URL (e.g. `http://localhost:3001`)
- `NEXT_PUBLIC_TREASURY_ADDRESS` — deployed vault address
- `NEXT_PUBLIC_GOVERNANCE_ADDRESS` — deployed governance address
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — RainbowKit WalletConnect project id

### Optional / operational
- `PORT` — backend port (default `3001`)
- `LOG_LEVEL` — backend log level (default `info`)
- `ETHERSCAN_API_KEY` — Etherscan verification
- `ARBISCAN_API_KEY` — Arbiscan verification

### CRE secret store (set in CRE project, not plain env)
- `OPENROUTER_API_KEY`
- `CREDORA_API_KEY` (if used in your confidential risk integration)

> Important: keep API keys and private keys out of source control; use secret managers in CI and CRE.

---

## 11. Quick Start (Docker)

### Prerequisites
- Node.js 20+
- Docker + Docker Compose
- Access to Sepolia RPC

### Steps

```bash
# 1) Install workspace dependencies
npm install

# 2) Create .env in repository root
# (fill required values from section 10)

# 3) Start infra + services
docker-compose up -d
```

Services:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`
- Health: `http://localhost:3001/health`
- Metrics: `http://localhost:3001/metrics`

---

## 12. Local Development (Non-Docker)

### 1) Install dependencies
```bash
npm install
```

### 2) Start Postgres (and optionally Redis)
Use your local service manager or Docker only for infra.

### 3) Run DB migrations
```bash
npm run db:migrate -w backend
```

### 4) Run frontend + backend
```bash
npm run dev
```

### 5) Build/test CRE workflow module
```bash
npm run build -w cre-workflow
npm run test -w cre-workflow
```

---

## 13. Deployment Runbook

### Option A — step-by-step

#### Deploy contracts
```bash
npm run deploy:sepolia -w contracts
```

This writes deployment metadata to:
- `packages/contracts/deployments/sepolia.json`

#### Wire addresses into app env
Set:
- `NEXT_PUBLIC_TREASURY_ADDRESS`
- `NEXT_PUBLIC_GOVERNANCE_ADDRESS`

#### Run database migration
```bash
npm run db:migrate -w backend
```

#### Build and register CRE workflow
```bash
npm run build -w cre-workflow
```
Then register `packages/cre-workflow/workflow.yaml` in Chainlink CRE dashboard.

### Option B — scripted deploy helper
```bash
source .env && bash scripts/deploy-all.sh
```

This script performs:
1. Env validation
2. Contract deployment
3. CRE workflow address injection
4. Prisma migration
5. Summary output

---

## 14. Testing

### All workspaces
```bash
npm run test
```

### Contracts only
```bash
npm run test -w contracts
```

### Backend only
```bash
npm run test -w backend
```

### CRE workflow only
```bash
npm run test -w cre-workflow
```

---

## 15. Monitoring & Operations

### Backend metrics
Prometheus metrics exposed at `/metrics`, including:
- `chaincfo_tvl_usd`
- `chaincfo_rebalance_total`
- `chaincfo_api_requests_total{route,status}`

### Event indexing
Backend subscribes to vault + governance events and persists them for analytics. It derives websocket endpoint by converting `SEPOLIA_RPC_URL` to `wss://...`.

### Health checks
`/health` verifies:
- Postgres queryability
- RPC configuration presence

---

## 16. Security Notes

Implemented controls include:
- Reentrancy guards for vault fund operations
- Pausable emergency stop
- Restricted CRE caller for report ingestion
- Slippage protection on withdrawals
- Governance majority vote before policy activation
- Compliance validation before execution
- Circuit breaker on reported TVL drawdown

Operational recommendations:
- Use a dedicated CRE signer/key with restricted privileges
- Rotate API keys regularly
- Remove any fallback/demo credentials from production branches
- Restrict owner/governor keys via multisig where possible

---

## 17. Deployed Addresses

**Sepolia Testnet:**
- `TreasuryVault`: `0x71a195Ae6468FC9926D5adbBF2Bb4971860E3e58`
- `GovernancePolicy`: `0x948Be877894511D8a58039bEBAB48c9984c0c06B`
- `ChainCFOCCIPReceiver`: `0xDbF67623180DED19a0beFB4050dfbe428C4a469A`

---

## 18. Chainlink Usage

ChainCFO heavily relies on the infrastructure of Chainlink to bring intelligent safety to DeFi:

1. **Chainlink CRE**: Powers all workflows via Node-hosted TypeScript computations. [Link to Code](https://github.com/UncleTom29/chaincfo/tree/main/packages/cre-workflow)
2. **Chainlink CCIP**: Facilitates secure cross-chain capital allocation executed by the AI strategy. [Link to Code](https://github.com/UncleTom29/chaincfo/tree/main/packages/contracts/contracts/ChainCFOCCIPReceiver.sol)
3. **Chainlink Data Feeds & PoR**: Used by the CRE runtime to deterministically verify stablecoin parity (e.g. USDC/USD) and protocol reserves before allowing any AI-directed rebalance.

---


## 19. Troubleshooting

### Backend starts but indexer does nothing
Check:
- `SEPOLIA_RPC_URL` is set and websocket-compatible
- `NEXT_PUBLIC_TREASURY_ADDRESS` is valid
- `NEXT_PUBLIC_GOVERNANCE_ADDRESS` is valid

### Frontend shows empty dashboard
Check:
- Backend reachable at `NEXT_PUBLIC_API_URL`
- At least one `Rebalanced` event has been indexed
- Database migrations were applied

### Contract deploy fails
Check:
- `PRIVATE_KEY` funded on Sepolia
- RPC URL valid and not rate-limited
- chain IDs in Hardhat config match target network

### CRE workflow not triggering on governance execution
Check:
- `workflow.yaml` governance address is updated to deployed contract
- Event signature matches deployed contract event
- CRE project has correct chain + trigger permissions

---

## Useful Commands (Cheat Sheet)

```bash
# Workspace dev (frontend + backend)
npm run dev

# Build all workspaces
npm run build

# Test all workspaces
npm run test

# Contract deploy
npm run deploy:sepolia -w contracts

# Backend DB migration
npm run db:migrate -w backend

# Start stack with Docker
docker-compose up -d
```


