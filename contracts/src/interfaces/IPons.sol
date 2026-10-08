// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal Pons V2 surfaces used by Feeverage (Robinhood Chain, chain id 4663).
/// Struct layouts mirror PonsV2LaunchFactory.TokenParams and PonsV2LauncherToken.Socials
/// exactly, so the ABI-encoded tuple matches what the router expects.
interface IPonsTypes {
    struct Socials {
        string twitter;
        string telegram;
        string discord;
        string website;
        string farcaster;
    }

    struct TokenParams {
        string name;
        string symbol;
        string logo;
        string description;
        Socials socials;
        address creatorFeeRecipient;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        bytes32 expectedEconomics;
        bytes32 salt;
    }
}

/// @notice PonsV2LaunchAndBuy router (0xe33E9E479dF8802cb0866d5d05258bEc4cF62948).
interface IPonsLaunchAndBuy is IPonsTypes {
    function launchAndBuy(
        TokenParams calldata params,
        uint256 launchConfigId,
        address pairToken,
        uint256 quoteIn,
        uint256 minTokensOut,
        address recipient,
        address[] calldata snipeTaxExemptions
    ) external payable returns (address token, address curve, uint256 tokensOut);
}

/// @notice PonsV2LaunchFactory (0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e).
interface IPonsFactory {
    function launchFee() external view returns (uint256);
    function canLaunch(address launcher) external view returns (bool);
    function transferCreatorFeeRecipient(address token, address newRecipient) external;
}

/// @notice Pons V2 fee escrow (0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e).
interface IPonsFeeEscrow {
    function claim() external returns (uint256 amount);
    function claimToken(address token) external returns (uint256 amount);
    function balanceOf(address recipient) external view returns (uint256);
    function balanceOfToken(address recipient, address token) external view returns (uint256);
}

/// @notice Pons V2 bonding curve: sweeping moves accrued trade fees into the escrow.
interface IPonsCurve {
    function sweepFees(uint256 minBuybackTokensOut) external;
    function graduated() external view returns (bool);
}
