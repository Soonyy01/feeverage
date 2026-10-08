// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {FeeverageLauncher} from "../src/FeeverageLauncher.sol";
import {IPonsLaunchAndBuy, IPonsFactory, IPonsFeeEscrow} from "../src/interfaces/IPons.sol";

/// Usage (Robinhood Chain mainnet, chain id 4663):
///   OWNER=0x... OPERATOR=0x... forge script script/Deploy.s.sol \
///     --rpc-url robinhood --private-key $DEPLOYER_KEY --broadcast
contract Deploy is Script {
    // Pons V2 on Robinhood Chain — verify on robinhoodchain.blockscout.com before deploying.
    address constant PONS_ROUTER = 0xe33E9E479dF8802cb0866d5d05258bEc4cF62948;
    address constant PONS_FACTORY = 0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e;
    address constant PONS_ESCROW = 0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e;

    function run() external returns (FeeverageLauncher launcher) {
        address owner = vm.envAddress("OWNER");
        address operator = vm.envAddress("OPERATOR");

        string[] memory markets = new string[](6);
        markets[0] = "BTC";
        markets[1] = "ETH";
        markets[2] = "HYPE";
        markets[3] = "SOL";
        markets[4] = "XRP";
        markets[5] = "DOGE";

        vm.startBroadcast();
        launcher = new FeeverageLauncher(
            owner,
            operator,
            IPonsLaunchAndBuy(PONS_ROUTER),
            IPonsFactory(PONS_FACTORY),
            IPonsFeeEscrow(PONS_ESCROW),
            markets
        );
        vm.stopBroadcast();

        console2.log("FeeverageLauncher:", address(launcher));
        console2.log("Pons public launching open for launcher:", IPonsFactory(PONS_FACTORY).canLaunch(address(launcher)));
    }
}
