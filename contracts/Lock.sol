// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

error UnsuccesedCall();

contract StakingTarget  is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    struct Stake {
        address user;
        uint224 amount;
        uint32 time;
        address token;
    }

    uint private stakingId;
    mapping(uint => Stake) public staking;

    event StakingEvent(uint id);

    address public currentProxy;
    
    function initialize(address _newInstance) public initializer {
        currentProxy = _newInstance;
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
    } 

    function _authorizeUpgrade(address newImplementation) internal onlyOwner override {}

    function getBytesForWithdraw(uint id, uint224 amountToWithdraw) public pure returns (bytes memory) {
        return abi.encodePacked(id, amountToWithdraw);
    }

    function getBytesForStaking(address user, uint224 amount, uint32 timestamp, address token) public pure returns (bytes memory) {
        return abi.encodePacked(user, amount, timestamp, token);
    }

    function stake(bytes calldata data) public returns(uint) {
        (bool success, bytes memory res) = currentProxy.delegatecall(abi.encodeWithSignature("executeStake(bytes)", data));
        require(success, UnsuccesedCall());

        return abi.decode(res, (uint));
    }

    // -1 withdraw att all, other return is new id of staking
    function withdraw(bytes calldata data) public returns(uint) {
        (bool success, bytes memory res) = currentProxy.delegatecall(abi.encodeWithSignature("executeWithdraw(bytes)", data));
        require(success, UnsuccesedCall());

        return abi.decode(res, (uint));
    }

    fallback(bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory res) = currentProxy.call(data);

        if (!ok) {
            revert UnsuccesedCall();
        }
        return res;
    } 
}

error NotOwner();
error TooManywOrNothingForWithdraw();
error TimeInFuture();
error NotValidInput();
error NotEnoughTokensInContractBalance();
error CannotStartStakingInPast(uint current, uint32 send);

contract StakeImplementation {
    struct Stake {
        address user;
        uint224 amount;
        uint32 time;
        address token;
    }

    uint private stakingId;
    mapping(uint => Stake) public staking;

    event StakingEvent(uint id);

    uint8 public percent;

    using SafeERC20 for IERC20;

    function executeStake(bytes calldata data) public returns(bytes memory) {
        require(data.length == 72, NotValidInput());
        address user;
        uint224 amount;
        uint32 time;
        address _tokenAddress;
   
        assembly {
            if lt(calldatasize(), add(data.offset, 72)) {
                revert(0, 0)
            }

            user := shr(96, calldataload(data.offset)) 

            amount := shr(32, calldataload(add(data.offset, 20)))

            time := shr(224, calldataload(add(data.offset, 48)))

            _tokenAddress := shr(96, calldataload(add(data.offset, 52)))
        }

        //100
        require(time >= block.timestamp - 100, CannotStartStakingInPast(block.timestamp, time));

        stakingId++;

        IERC20 token = IERC20(_tokenAddress);

        token.safeTransferFrom(user, address(this), amount);
        staking[stakingId] = Stake(user, amount, time, _tokenAddress);

        emit StakingEvent(stakingId);

        return abi.encodePacked(stakingId); 
    }

    function executeWithdraw(bytes calldata data) public returns(bytes memory) {
        uint id;
        uint224 amountToWithdraw;
   
        assembly {
            id := calldataload(data.offset)

            amountToWithdraw := shr(32, calldataload(add(data.offset, 32)))
        }

        Stake memory current = staking[id];

        require(current.user == msg.sender, NotOwner());
        require(current.amount > 0 && current.amount >= amountToWithdraw, TooManywOrNothingForWithdraw());

        uint result = amountToWithdraw + countReward(current.time, current.amount, 10);

        current.amount -= amountToWithdraw;

        IERC20 token = IERC20(current.token);

        require(token.balanceOf(address(this)) > 0, NotEnoughTokensInContractBalance());

        token.safeTransfer(current.user, result);

        if (current.amount != amountToWithdraw) {
            current.time = uint32(block.timestamp);
        }

        emit StakingEvent(id);

        return abi.encodePacked(id);
    }

    function countReward(uint32 timestamp, uint224 amountOfTokens, uint percentsPerYear) public view returns (uint reward) {
        require(timestamp <= block.timestamp, TimeInFuture());

        uint timeElapsed = block.timestamp - timestamp;

        reward = (amountOfTokens * percentsPerYear * timeElapsed * 1_000_000) / (100_000_000 * 31536000);

        return reward;
    }
}