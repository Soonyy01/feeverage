// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPonsFeeEscrow} from "./interfaces/IPons.sol";

interface IFeeverageLauncherView {
    function operator() external view returns (address);
    function owner() external view returns (address);
    function feeEscrow() external view returns (IPonsFeeEscrow);
}

/// @title FeeverageFeeSink
/// @notice One sink per launched token, set as that token's Pons creatorFeeRecipient.
/// Because Pons' escrow keeps one balance per recipient, a dedicated sink per token
/// is what lets every token's fees be attributed to its own Hyperliquid position.
/// Anyone may call `sweep`; funds can only ever move to the launcher's operator,
/// the hot wallet that bridges them to Hyperliquid.
contract FeeverageFeeSink {
    using SafeERC20 for IERC20;

    IFeeverageLauncherView public launcher;
    address public token;

    event Swept(address indexed token, address indexed to, uint256 amount);
    event SweptToken(address indexed token, address indexed asset, address indexed to, uint256 amount);

    error AlreadyInitialized();
    error NotLauncher();
    error NotLauncherOwner();
    error TransferFailed();

    /// @dev Called once by the launcher right after cloning.
    function initialize(address launcher_) external {
        if (address(launcher) != address(0)) revert AlreadyInitialized();
        launcher = IFeeverageLauncherView(launcher_);
    }

    /// @dev The token address is only known after the Pons launch returns.
    function bindToken(address token_) external {
        if (msg.sender != address(launcher)) revert NotLauncher();
        if (token != address(0)) revert AlreadyInitialized();
        token = token_;
    }

    /// @notice Claims native ETH fees from the Pons escrow and forwards everything
    /// this sink holds to the operator. Never reverts on an empty escrow.
    function sweep() external returns (uint256 amount) {
        IPonsFeeEscrow escrow = launcher.feeEscrow();
        if (escrow.balanceOf(address(this)) > 0) {
            escrow.claim();
        }
        amount = address(this).balance;
        if (amount == 0) return 0;
        address to = launcher.operator();
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Swept(token, to, amount);
    }

    /// @notice Same as `sweep` for an ERC-20 quote asset (only relevant for non-ETH pairs).
    function sweepToken(address asset) external returns (uint256 amount) {
        IPonsFeeEscrow escrow = launcher.feeEscrow();
        if (escrow.balanceOfToken(address(this), asset) > 0) {
            escrow.claimToken(asset);
        }
        amount = IERC20(asset).balanceOf(address(this));
        if (amount == 0) return 0;
        address to = launcher.operator();
        IERC20(asset).safeTransfer(to, amount);
        emit SweptToken(token, asset, to, amount);
    }

    /// @notice Emergency migration: hands this token's Pons creator fee stream to a
    /// new recipient (e.g. a fixed sink). Only the launcher owner can do this.
    function migrateFeeRecipient(address ponsFactory, address newRecipient) external {
        if (msg.sender != launcher.owner()) revert NotLauncherOwner();
        (bool ok, bytes memory ret) = ponsFactory.call(
            abi.encodeWithSignature("transferCreatorFeeRecipient(address,address)", token, newRecipient)
        );
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }

    receive() external payable {}
}
