import { expect } from "chai";
import { ethers } from "hardhat";
import { GovernancePolicy } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("GovernancePolicy", function () {
  let governance: GovernancePolicy;
  let owner: HardhatEthersSigner;
  let governor1: HardhatEthersSigner;
  let governor2: HardhatEthersSigner;
  let nonGovernor: HardhatEthersSigner;

  const defaultPolicy = {
    maxAllocationBps: 5000n,
    minLiquidityBufferBps: 500n,
    maxProtocols: 5n,
    rebalanceIntervalSecs: 14400n,
    requireProofOfReserve: false,
  };

  beforeEach(async function () {
    [owner, governor1, governor2, nonGovernor] = await ethers.getSigners();

    const GovernancePolicy = await ethers.getContractFactory("GovernancePolicy");
    governance = await GovernancePolicy.deploy();
    await governance.waitForDeployment();

    await governance.addGovernor(governor1.address);
    await governance.addGovernor(governor2.address);
  });

  describe("proposePolicy", function () {
    it("should allow governors to propose", async function () {
      await expect(governance.connect(governor1).proposePolicy(defaultPolicy))
        .to.emit(governance, "GovernancePolicyProposed")
        .withArgs(0, governor1.address, Object.values(defaultPolicy));
    });

    it("should revert for non-governors", async function () {
      await expect(governance.connect(nonGovernor).proposePolicy(defaultPolicy))
        .to.be.revertedWith("GovernancePolicy: not a governor");
    });
  });

  describe("executePolicy", function () {
    it("should execute and emit GovernanceVoteExecuted with correct params", async function () {
      await governance.connect(governor1).proposePolicy(defaultPolicy);
      await governance.connect(governor1).votePolicy(0);
      await governance.connect(governor2).votePolicy(0);

      await expect(governance.connect(governor1).executePolicy(0))
        .to.emit(governance, "GovernanceVoteExecuted")
        .withArgs(0, Object.values(defaultPolicy));

      const policy = await governance.getPolicy();
      expect(policy.maxAllocationBps).to.equal(defaultPolicy.maxAllocationBps);
    });

    it("should revert without majority votes", async function () {
      await governance.connect(governor1).proposePolicy(defaultPolicy);
      // Only 1 vote out of 2 governors (not majority)
      await governance.connect(governor1).votePolicy(0);
      await expect(governance.connect(governor1).executePolicy(0))
        .to.be.revertedWith("GovernancePolicy: insufficient votes for majority");
    });

    it("should revert for non-governors", async function () {
      await governance.connect(governor1).proposePolicy(defaultPolicy);
      await governance.connect(governor1).votePolicy(0);
      await governance.connect(governor2).votePolicy(0);
      await expect(governance.connect(nonGovernor).executePolicy(0))
        .to.be.revertedWith("GovernancePolicy: not a governor");
    });

    it("should revert on double execution", async function () {
      await governance.connect(governor1).proposePolicy(defaultPolicy);
      await governance.connect(governor1).votePolicy(0);
      await governance.connect(governor2).votePolicy(0);
      await governance.connect(governor1).executePolicy(0);
      await expect(governance.connect(governor1).executePolicy(0))
        .to.be.revertedWith("GovernancePolicy: already executed");
    });
  });

  describe("governor management", function () {
    it("should prevent non-governors from proposing after removal", async function () {
      await governance.removeGovernor(governor1.address);
      await expect(governance.connect(governor1).proposePolicy(defaultPolicy))
        .to.be.revertedWith("GovernancePolicy: not a governor");
    });
  });
});
