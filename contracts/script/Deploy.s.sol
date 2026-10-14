// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Script.sol";
import "../src/EchoLoomHub.sol";

contract Deploy is Script {
    function run() external returns (EchoLoomHub hub) {
        require(block.chainid == 10143, "wrong chain: Monad Testnet 10143 required");
        string memory rpc = vm.envString("MONAD_TESTNET_RPC_URL");
        require(keccak256(bytes(rpc)) == keccak256(bytes("https://testnet-rpc.monad.xyz")), "unexpected Monad Testnet RPC endpoint");
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(key);
        require(deployer.balance >= 0.01 ether, "deployer needs at least 0.01 MON for deployment gas");
        vm.startBroadcast(key);
        hub = new EchoLoomHub();
        vm.stopBroadcast();
    }
}
