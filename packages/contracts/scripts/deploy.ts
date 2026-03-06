import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  const usdcSepolia = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  const ccipRouterSepolia = process.env.CCIP_ROUTER_SEPOLIA || "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59";

  // 1. Deploy TreasuryVault
  console.log("\nDeploying TreasuryVault...");
  const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
  const vault = await TreasuryVault.deploy(usdcSepolia);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("TreasuryVault deployed to:", vaultAddress);

  // 2. Deploy GovernancePolicy
  console.log("\nDeploying GovernancePolicy...");
  const GovernancePolicy = await ethers.getContractFactory("GovernancePolicy");
  const governance = await GovernancePolicy.deploy();
  await governance.waitForDeployment();
  const governanceAddress = await governance.getAddress();
  console.log("GovernancePolicy deployed to:", governanceAddress);

  // Add deployer as governor
  console.log("Adding deployer as governor...");
  const addGovTx = await governance.addGovernor(deployer.address);
  await addGovTx.wait();
  console.log("Deployer added as governor");

  // 3. Deploy ChainCFOCCIPReceiver
  console.log("\nDeploying ChainCFOCCIPReceiver...");
  const CCIPReceiver = await ethers.getContractFactory("ChainCFOCCIPReceiver");
  const ccipReceiver = await CCIPReceiver.deploy(ccipRouterSepolia, usdcSepolia);
  await ccipReceiver.waitForDeployment();
  const ccipReceiverAddress = await ccipReceiver.getAddress();
  console.log("ChainCFOCCIPReceiver deployed to:", ccipReceiverAddress);

  // 4. Set CRE caller to deployer as placeholder
  console.log("\nSetting CRE caller to deployer (placeholder)...");
  const setCallerTx = await vault.setCreCaller(deployer.address);
  await setCallerTx.wait();
  console.log("CRE caller set to:", deployer.address);

  // 5. Save addresses to deployments/sepolia.json
  const deployments = {
    network: "sepolia",
    chainId: 11155111,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      TreasuryVault: vaultAddress,
      GovernancePolicy: governanceAddress,
      ChainCFOCCIPReceiver: ccipReceiverAddress,
    },
    config: {
      usdcSepolia,
      ccipRouterSepolia,
    },
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(deploymentsDir, "sepolia.json"),
    JSON.stringify(deployments, null, 2)
  );

  console.log("\n✅ Deployment Summary:");
  console.log("=".repeat(50));
  console.log("TreasuryVault:       ", vaultAddress);
  console.log("GovernancePolicy:    ", governanceAddress);
  console.log("ChainCFOCCIPReceiver:", ccipReceiverAddress);
  console.log("=".repeat(50));
  console.log("Saved to deployments/sepolia.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
