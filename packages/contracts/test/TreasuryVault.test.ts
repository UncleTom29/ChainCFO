import { expect } from "chai";
import { ethers } from "hardhat";
import { TreasuryVault } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("TreasuryVault", function () {
  let vault: TreasuryVault;
  let mockToken: any;
  let owner: HardhatEthersSigner;
  let creCaller: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;

  const INITIAL_SUPPLY = ethers.parseUnits("1000000", 6); // 1M USDC
  const DEPOSIT_AMOUNT = ethers.parseUnits("1000", 6);    // 1000 USDC

  beforeEach(async function () {
    [owner, creCaller, user1, user2] = await ethers.getSigners();

    // Deploy mock ERC20
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("Mock USDC", "USDC", 6);
    await mockToken.waitForDeployment();

    // Deploy vault
    const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
    vault = await TreasuryVault.deploy(await mockToken.getAddress());
    await vault.waitForDeployment();

    // Set CRE caller
    await vault.setCreCaller(creCaller.address);

    // Mint tokens to users
    await mockToken.mint(user1.address, INITIAL_SUPPLY);
    await mockToken.mint(user2.address, INITIAL_SUPPLY);

    // Approve vault
    await mockToken.connect(user1).approve(await vault.getAddress(), INITIAL_SUPPLY);
    await mockToken.connect(user2).approve(await vault.getAddress(), INITIAL_SUPPLY);
  });

  describe("deposit", function () {
    it("should mint correct shares on first deposit", async function () {
      await vault.connect(user1).deposit(DEPOSIT_AMOUNT);
      const shares = await vault.userShares(user1.address);
      expect(shares).to.equal(DEPOSIT_AMOUNT);
      expect(await vault.totalShares()).to.equal(DEPOSIT_AMOUNT);
    });

    it("should mint proportional shares on subsequent deposits", async function () {
      await vault.connect(user1).deposit(DEPOSIT_AMOUNT);
      await vault.connect(user2).deposit(DEPOSIT_AMOUNT);

      const shares1 = await vault.userShares(user1.address);
      const shares2 = await vault.userShares(user2.address);
      expect(shares1).to.equal(shares2);
    });

    it("should emit Deposited event", async function () {
      await expect(vault.connect(user1).deposit(DEPOSIT_AMOUNT))
        .to.emit(vault, "Deposited")
        .withArgs(user1.address, DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
    });

    it("should revert if amount is 0", async function () {
      await expect(vault.connect(user1).deposit(0))
        .to.be.revertedWith("TreasuryVault: amount must be > 0");
    });

    it("should revert when paused", async function () {
      await vault.pause();
      await expect(vault.connect(user1).deposit(DEPOSIT_AMOUNT))
        .to.be.revertedWithCustomError(vault, "EnforcedPause");
    });
  });

  describe("withdraw", function () {
    beforeEach(async function () {
      await vault.connect(user1).deposit(DEPOSIT_AMOUNT);
    });

    it("should return proportional USDC on withdraw", async function () {
      const sharesBefore = await vault.userShares(user1.address);
      const balanceBefore = await mockToken.balanceOf(user1.address);

      await vault.connect(user1).withdraw(sharesBefore, 0);

      const sharesAfter = await vault.userShares(user1.address);
      const balanceAfter = await mockToken.balanceOf(user1.address);

      expect(sharesAfter).to.equal(0);
      expect(balanceAfter - balanceBefore).to.equal(DEPOSIT_AMOUNT);
    });

    it("should emit Withdrawn event", async function () {
      const shares = await vault.userShares(user1.address);
      await expect(vault.connect(user1).withdraw(shares, 0))
        .to.emit(vault, "Withdrawn")
        .withArgs(user1.address, shares, DEPOSIT_AMOUNT);
    });

    it("should revert on insufficient shares", async function () {
      const shares = await vault.userShares(user1.address);
      await expect(vault.connect(user1).withdraw(shares + 1n, 0))
        .to.be.revertedWith("TreasuryVault: insufficient shares");
    });

    it("should revert on slippage protection", async function () {
      const shares = await vault.userShares(user1.address);
      const tooHigh = DEPOSIT_AMOUNT + 1n;
      await expect(vault.connect(user1).withdraw(shares, tooHigh))
        .to.be.revertedWith("TreasuryVault: slippage exceeded");
    });

    it("should revert when paused", async function () {
      await vault.pause();
      const shares = await vault.userShares(user1.address);
      await expect(vault.connect(user1).withdraw(shares, 0))
        .to.be.revertedWithCustomError(vault, "EnforcedPause");
    });
  });

  describe("rebalance", function () {
    const allocations = [
      {
        protocol: "0x0000000000000000000000000000000000000001",
        chainId: 1n,
        basisPoints: 5000n,
        name: "Aave",
      },
      {
        protocol: "0x0000000000000000000000000000000000000002",
        chainId: 1n,
        basisPoints: 5000n,
        name: "Compound",
      },
    ];

    it("should store allocation report", async function () {
      await vault.connect(creCaller).rebalance(allocations, "Test rationale", 100000n);
      const history = await vault.getAllocationHistory(1);
      expect(history.length).to.equal(1);
      expect(history[0].llmRationale).to.equal("Test rationale");
      expect(history[0].totalValueUsd).to.equal(100000n);
    });

    it("should emit Rebalanced event", async function () {
      await expect(vault.connect(creCaller).rebalance(allocations, "Test", 100000n))
        .to.emit(vault, "Rebalanced")
        .withArgs(0, 100000n, "Test");
    });

    it("should revert if called by non-CRE address", async function () {
      await expect(vault.connect(user1).rebalance(allocations, "Test", 100000n))
        .to.be.revertedWith("TreasuryVault: caller is not CRE");
    });

    it("should revert if too many protocols", async function () {
      const tooMany = Array(11).fill(allocations[0]);
      await expect(vault.connect(creCaller).rebalance(tooMany, "Test", 100000n))
        .to.be.revertedWith("TreasuryVault: too many protocols");
    });

    it("should trigger circuit breaker when TVL drops below 80%", async function () {
      await vault.connect(creCaller).rebalance(allocations, "First", 100000n);
      await expect(vault.connect(creCaller).rebalance(allocations, "Second", 79000n))
        .to.emit(vault, "CircuitBreakerTriggered");
      expect(await vault.paused()).to.be.true;
    });
  });

  describe("getAllocationHistory", function () {
    it("should return last N reports", async function () {
      const allocations = [
        { protocol: "0x0000000000000000000000000000000000000001", chainId: 1n, basisPoints: 10000n, name: "Aave" },
      ];
      await vault.connect(creCaller).rebalance(allocations, "Report 1", 100000n);
      if (await vault.paused()) await vault.unpause();
      await vault.connect(creCaller).rebalance(allocations, "Report 2", 100000n);

      const history = await vault.getAllocationHistory(1);
      expect(history.length).to.equal(1);
    });
  });
});
