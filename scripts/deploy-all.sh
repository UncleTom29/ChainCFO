#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# ChainCFO — Full Deployment Script
# Validates env vars, deploys contracts, updates CRE config, migrates DB.
# ─────────────────────────────────────────────────────────────────────────────

REQUIRED_VARS=(
  PRIVATE_KEY
  SEPOLIA_RPC_URL
  ARBITRUM_SEPOLIA_RPC_URL
  CCIP_ROUTER_SEPOLIA
  CCIP_ROUTER_ARBITRUM
  CHAINLINK_DATA_FEED_USDC_USD
  GEMINI_API_KEY
  DATABASE_URL
)

echo "🔍 Validating environment variables..."
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "❌ Missing required environment variable: $var"
    exit 1
  fi
done
echo "✅ All required environment variables are set."

# 1. Deploy contracts
echo ""
echo "📦 Deploying contracts to Sepolia..."
cd "$(dirname "$0")/../packages/contracts"
npx hardhat run scripts/deploy.ts --network sepolia
DEPLOYMENT_FILE="deployments/sepolia.json"
if [ ! -f "$DEPLOYMENT_FILE" ]; then
  echo "❌ Deployment file not found: $DEPLOYMENT_FILE"
  exit 1
fi
echo "✅ Contracts deployed. Reading addresses..."

TREASURY_ADDRESS=$(node -e "const d=require('./$DEPLOYMENT_FILE'); console.log(d.contracts.TreasuryVault)")
GOVERNANCE_ADDRESS=$(node -e "const d=require('./$DEPLOYMENT_FILE'); console.log(d.contracts.GovernancePolicy)")
CCIP_RECEIVER_ADDRESS=$(node -e "const d=require('./$DEPLOYMENT_FILE'); console.log(d.contracts.ChainCFOCCIPReceiver)")

echo "  TreasuryVault:        $TREASURY_ADDRESS"
echo "  GovernancePolicy:     $GOVERNANCE_ADDRESS"
echo "  ChainCFOCCIPReceiver: $CCIP_RECEIVER_ADDRESS"

# 2. Inject addresses into CRE workflow YAML
echo ""
echo "⚙️  Updating CRE workflow configuration..."
cd "$(dirname "$0")/../packages/cre-workflow"
sed -i "s|\${GOVERNANCE_CONTRACT}|$GOVERNANCE_ADDRESS|g" workflow.yaml
echo "✅ CRE workflow.yaml updated with GovernancePolicy address: $GOVERNANCE_ADDRESS"

# 3. Run Prisma migrations
echo ""
echo "🗄️  Running database migrations..."
cd "$(dirname "$0")/../packages/backend"
npx prisma migrate deploy
echo "✅ Database migrations applied."

# 4. Print summary
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ ChainCFO Deployment Complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Contract Addresses (Sepolia):"
echo "  TreasuryVault:        $TREASURY_ADDRESS"
echo "  GovernancePolicy:     $GOVERNANCE_ADDRESS"
echo "  ChainCFOCCIPReceiver: $CCIP_RECEIVER_ADDRESS"
echo ""
echo "Next Steps:"
echo "  1. Update .env with contract addresses:"
echo "     NEXT_PUBLIC_TREASURY_ADDRESS=$TREASURY_ADDRESS"
echo "     NEXT_PUBLIC_GOVERNANCE_ADDRESS=$GOVERNANCE_ADDRESS"
echo ""
echo "  2. Register the CRE workflow at https://cre.chain.link"
echo "     - Upload packages/cre-workflow/workflow.yaml"
echo "     - Set GEMINI_API_KEY and CREDORA_API_KEY as secrets"
echo "     - The workflow will trigger every 4h and on GovernanceVoteExecuted"
echo ""
echo "  3. Start services:"
echo "     docker-compose up -d"
echo ""
echo "═══════════════════════════════════════════════════════════════"
