import { loadFixture, ethers, expect } from './setup';
import { IERC20__factory } from '../typechain-types';
import { contract } from '@chainlink/test-helpers';

describe("Staking Contract Tests", function () {

  async function deployContracts() {
    const [owner] = await ethers.getSigners();
    
    const ImplementationFactory = await ethers.getContractFactory("StakeImplementation", owner);
    const implementation = await ImplementationFactory.deploy();
    await implementation.waitForDeployment();

    const ProxyFactory = await ethers.getContractFactory("StakingTarget", owner);
    const proxy = await ProxyFactory.deploy();
    await proxy.waitForDeployment();

    await proxy.initialize(await implementation.getAddress());

    const usdtAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
    const usdt = IERC20__factory.connect(usdtAddress, owner);

    const user = await ethers.getImpersonatedSigner("0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503");

    return { owner, user, proxy, implementation, usdt };
  }

  it("should stake tokens successfully", async function() {
    const { user, proxy, implementation, usdt } = await loadFixture(deployContracts);
    
    const stakeAmount = ethers.parseUnits("100", 6);
    const stakeTime = Math.floor(Date.now() / 1000);
    

    const stakingData = await proxy.getBytesForStaking(
      user.address,
      stakeAmount,
      stakeTime,
      await usdt.getAddress()
    );

    await usdt.connect(user).approve(await proxy.getAddress(), stakeAmount);

    await expect(proxy.connect(user).stake(stakingData)).to.emit(proxy, "StakingEvent").withArgs(1);


    const stakeInfo = await proxy.staking(1);
    expect(stakeInfo.user).to.equal(user.address);
    expect(stakeInfo.amount).to.equal(stakeAmount);
    expect(stakeInfo.token).to.equal(await usdt.getAddress());
  });

  it("should fail with invalid input data", async function() {
    const { owner, user, proxy, implementation, usdt } = await loadFixture(deployContracts);
    
    const invalidData = ethers.toUtf8Bytes("invalid");
    
    await expect(proxy.connect(user).stake(invalidData)).to.be.revertedWithCustomError(proxy, "UnsuccesedCall");
  });

  it("should fail if token transfer fails", async function() {
    const { user, proxy, usdt } = await loadFixture(deployContracts);
    
    const stakeAmount = ethers.parseUnits("100", 6);
    const stakeTime = Math.floor(Date.now() / 1000);
    
    const stakingData = await proxy.getBytesForStaking(
      user.address,
      stakeAmount,
      stakeTime,
      await usdt.getAddress()
    );

  
    await expect(proxy.connect(user).stake(stakingData)).to.be.reverted; 
  });

  it("should allow multiple stakes", async function() {
    const {user, proxy, implementation, usdt } = await loadFixture(deployContracts);
    
    const stakeAmount = ethers.parseUnits("100", 6);
    const stakeTime = Math.floor(Date.now() / 1000);
    
    await usdt.connect(user).approve(await proxy.getAddress(), stakeAmount * 2n);

    const stakingData1 = await proxy.getBytesForStaking(
      user.address,
      stakeAmount,
      stakeTime,
      await usdt.getAddress()
    );

    await proxy.connect(user).stake(stakingData1);

    const stakingData2 = await proxy.getBytesForStaking(
      user.address,
      stakeAmount,
      stakeTime,
      await usdt.getAddress()
    );

    await expect(proxy.connect(user).stake(stakingData2)).to.emit(proxy, "StakingEvent").withArgs(2);

    const stake1 = await proxy.staking(1);
    const stake2 = await proxy.staking(2);
    expect(stake1.amount).to.equal(stakeAmount);
    expect(stake2.amount).to.equal(stakeAmount);
  });

  it("should withdraw tokens successfully", async function() {
    const { user, proxy, usdt } = await loadFixture(deployContracts);
    
    const stakeAmount = ethers.parseUnits("100", 6);
    const stakeTime = (await ethers.provider.getBlock('latest'))!.timestamp;
    
    await usdt.connect(user).approve(await proxy.getAddress(), stakeAmount);

    const stakingData = await proxy.getBytesForStaking(
      user.address,
      stakeAmount,
      stakeTime,
      await usdt.getAddress()
    );

    await proxy.connect(user).stake(stakingData);

    const withdrawData = await proxy.getBytesForWithdraw(1, stakeAmount);

    await expect(proxy.connect(user).withdraw(withdrawData))
      .to.emit(proxy, "StakingEvent").withArgs(1);
  });

  it("should fail to withdraw if not the owner", async function() {
    const { owner, user, proxy, usdt } = await loadFixture(deployContracts);
    
    const stakeAmount = ethers.parseUnits("100", 6);
    const stakeTime = Math.floor(Date.now() / 1000);
    
    await usdt.connect(user).approve(await proxy.getAddress(), stakeAmount);

    const stakingData = await proxy.getBytesForStaking(
      user.address,
      stakeAmount,
      stakeTime,
      await usdt.getAddress()
    );

    await proxy.connect(user).stake(stakingData);

    await expect(proxy.connect(owner).withdraw(await proxy.getBytesForWithdraw(1, stakeAmount))).to.be.revertedWithCustomError(proxy, "UnsuccesedCall");
  });

  it("should calculate rewards correctly", async function() {
    const { implementation } = await loadFixture(deployContracts);
    
    const stakeAmount = ethers.parseUnits("100", 6);
    const stakeTime = Math.floor(Date.now() / 1000) - 31536000; // 1 year ago
    
    const reward = await implementation.countReward(stakeTime, stakeAmount, 10);
    
    expect(reward).to.be.gt(0);
  });

  it("should fail to upgrade contract if not owner", async function() {
    const { user, proxy } = await loadFixture(deployContracts);

    const ImplementationFactory = await ethers.getContractFactory("StakeImplementation", user);
    const implementation = await ImplementationFactory.deploy();
    await implementation.waitForDeployment();
    
    await expect(proxy.connect(user).initialize(await implementation.getAddress())).to.be.revertedWithCustomError(proxy, "InvalidInitialization")
  });
});
