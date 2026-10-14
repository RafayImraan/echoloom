// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "../src/EchoLoomHub.sol";

contract EchoLoomHubTest is Test {
    EchoLoomHub hub;
    address curator = address(0xCAFE);
    address creator = address(0xBEEF);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    uint256 loomId; uint256 postId;

    function setUp() public {
        hub = new EchoLoomHub();
        vm.deal(alice, 100 ether); vm.deal(bob, 100 ether); vm.deal(creator, 10 ether);
        vm.prank(curator); loomId = hub.createLoom("AI", "Research", "Technology", 2000, 1000, 7000, 1 days);
        vm.prank(creator); postId = hub.createPost(loomId, "ipfs://post", keccak256("text"));
    }
    function testCreateAndSnapshotLoomRulesOnPost() public view {
        (address c,bool active,uint16 cBps,uint16 curatorBps,uint16 supporterBps) = hub.getLoomCore(loomId);
        assertEq(c, curator); assertTrue(active);
        (address pCreator,uint256 pLoom,,,) = hub.getPostCore(postId);
        assertEq(pCreator, creator); assertEq(pLoom, loomId);
        assertEq(cBps, 2000); assertEq(curatorBps, 1000); assertEq(supporterBps, 7000);
    }
    function testRejectInvalidAllocationAndUnauthorizedUpdate() public {
        vm.prank(alice); vm.expectRevert(EchoLoomHub.InvalidInput.selector);
        hub.createLoom("bad", "", "x", 6000, 3000, 2000, 1 days);
        vm.prank(alice); vm.expectRevert(EchoLoomHub.Unauthorized.selector);
        hub.updateLoom(loomId, "x", "", "x", 1, 1, 1, 1 days);
    }
    function testStakingAccountingAndDeadlineWithdrawal() public {
        vm.prank(alice); hub.stake{value: 2 ether}(postId);
        vm.prank(bob); hub.stake{value: 3 ether}(postId);
        assertEq(hub.stakeOf(postId, alice), 2 ether);
        (,,,uint256 total,) = hub.getPostCore(postId); assertEq(total, 5 ether);
        vm.prank(alice); vm.expectRevert(EchoLoomHub.TooEarly.selector); hub.withdrawStake(postId);
        vm.warp(block.timestamp + 1 days);
        uint256 before = alice.balance; vm.prank(alice); hub.withdrawStake(postId);
        assertEq(alice.balance, before + 2 ether); assertEq(hub.stakeOf(postId, alice), 0);
    }
    function testRejectZeroStakeAndExpiredStake() public {
        vm.prank(alice); vm.expectRevert(EchoLoomHub.InvalidInput.selector); hub.stake(postId);
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice); vm.expectRevert(EchoLoomHub.InvalidInput.selector); hub.stake{value: 1}(postId);
    }
    function testRejectTimestampCastOverflow() public {
        vm.warp(uint256(type(uint64).max) - 12 hours);
        vm.prank(creator); vm.expectRevert(EchoLoomHub.InvalidInput.selector);
        hub.createPost(loomId, "ipfs://overflow", bytes32(0));
    }

    function testStakeDeadlineExactBoundary() public {
        vm.prank(alice); hub.stake{value: 1 ether}(postId);
        (, , uint64 deadline,,) = hub.getPostCore(postId);
        vm.warp(uint256(deadline) - 1);
        vm.prank(bob); hub.stake{value: 1 ether}(postId);
        vm.warp(deadline);
        vm.prank(bob); vm.expectRevert(EchoLoomHub.InvalidInput.selector); hub.stake{value: 1}(postId);
        vm.prank(alice); hub.withdrawStake(postId);
    }
    function testTipFeeAndPullWithdrawal() public {
        vm.prank(alice); hub.tip{value: 1 ether}(payable(creator));
        assertEq(hub.pendingWithdrawals(creator), 0.98 ether);
        assertEq(hub.protocolFees(), 0.02 ether);
        uint256 before = creator.balance; vm.prank(creator); hub.withdrawEarnings();
        assertEq(creator.balance, before + 0.98 ether);
    }
    function testFundedRewardsProRataAndDoubleClaimRejected() public {
        vm.prank(alice); hub.stake{value: 1 ether}(postId);
        vm.prank(bob); hub.stake{value: 3 ether}(postId);
        vm.prank(creator); hub.fundReward{value: 4 ether}(postId);
        vm.warp(block.timestamp + 1 days);
        uint256 before = alice.balance; vm.prank(alice); hub.claimReward(postId, 0);
        assertEq(alice.balance - before, 0.7 ether);
        vm.prank(alice); vm.expectRevert(EchoLoomHub.NothingToWithdraw.selector); hub.claimReward(postId, 0);
        before = creator.balance; vm.prank(creator); hub.claimReward(postId, 1);
        assertEq(creator.balance - before, 0.8 ether);
        before = curator.balance; vm.prank(curator); hub.claimReward(postId, 2);
        assertEq(curator.balance - before, 0.4 ether);
    }
    function testCreatorAndCuratorAllocationsCannotBeClaimedTwice() public {
        vm.prank(creator); hub.fundReward{value: 1 ether}(postId);
        vm.warp(block.timestamp + 1 days);
        vm.prank(creator); hub.claimReward(postId, 1);
        vm.prank(creator); vm.expectRevert(EchoLoomHub.NothingToWithdraw.selector); hub.claimReward(postId, 1);
        vm.prank(curator); hub.claimReward(postId, 2);
        vm.prank(curator); vm.expectRevert(EchoLoomHub.NothingToWithdraw.selector); hub.claimReward(postId, 2);
    }
    function testWithdrawnPrincipalDoesNotEraseSupporterRewardWeight() public {
        vm.prank(alice); hub.stake{value: 1 ether}(postId);
        vm.prank(bob); hub.stake{value: 3 ether}(postId);
        vm.prank(creator); hub.fundReward{value: 4 ether}(postId);
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice); hub.withdrawStake(postId);
        uint256 before = alice.balance; vm.prank(alice); hub.claimReward(postId, 0);
        assertEq(alice.balance - before, 0.7 ether);
    }
    function testUnfundedRewardCannotBeClaimedAndClaimFlagRollsBack() public {
        vm.prank(alice); hub.stake{value: 1 ether}(postId);
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice); vm.expectRevert(EchoLoomHub.NothingToWithdraw.selector); hub.claimReward(postId, 0);
        assertFalse(hub.supporterClaimed(postId, alice));
        vm.prank(creator); vm.expectRevert(EchoLoomHub.NothingToWithdraw.selector); hub.claimReward(postId, 1);
    }
    function testContractBalanceCoversRemainingPrincipalAndRewardLiabilities() public {
        vm.prank(alice); hub.stake{value: 1 ether}(postId);
        vm.prank(bob); hub.stake{value: 3 ether}(postId);
        vm.prank(creator); hub.fundReward{value: 4 ether}(postId);
        vm.prank(alice); hub.tip{value: 1 ether}(payable(creator));
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice); hub.withdrawStake(postId);
        vm.prank(alice); hub.claimReward(postId, 0);
        vm.prank(creator); hub.claimReward(postId, 1);
        vm.prank(curator); hub.claimReward(postId, 2);
        // Bob's 3 MON principal and 2.1 MON supporter allocation remain payable.
        // Creator tip credit (0.98) and protocol fee (0.02) are separate liabilities.
        assertEq(address(hub).balance, 3 ether + 2.1 ether + 0.98 ether + 0.02 ether);
    }
    function testFuzzRewardClaimsNeverExceedFundedAssets(uint96 rawAliceStake, uint96 rawBobStake, uint96 rawFunding) public {
        uint256 aliceStake = uint256(rawAliceStake) + 1;
        uint256 bobStake = uint256(rawBobStake) + 1;
        uint256 funding = uint256(rawFunding) + 1;
        vm.deal(alice, aliceStake); vm.deal(bob, bobStake); vm.deal(creator, funding);
        vm.prank(alice); hub.stake{value: aliceStake}(postId);
        vm.prank(bob); hub.stake{value: bobStake}(postId);
        vm.prank(creator); hub.fundReward{value: funding}(postId);
        vm.warp(block.timestamp + 1 days);

        uint256 aliceBefore = alice.balance; uint256 bobBefore = bob.balance;
        uint256 creatorBefore = creator.balance; uint256 curatorBefore = curator.balance;
        uint256 supporterPool = funding * 7000 / hub.BPS();
        uint256 aliceSupport = supporterPool * aliceStake / (aliceStake + bobStake);
        uint256 bobSupport = supporterPool * bobStake / (aliceStake + bobStake);
        uint256 creatorShare = funding * 2000 / hub.BPS();
        uint256 curatorShare = funding * 1000 / hub.BPS();
        vm.prank(alice);
        if (aliceSupport == 0) vm.expectRevert(EchoLoomHub.NothingToWithdraw.selector);
        hub.claimReward(postId, 0);
        vm.prank(bob);
        if (bobSupport == 0) vm.expectRevert(EchoLoomHub.NothingToWithdraw.selector);
        hub.claimReward(postId, 0);
        vm.prank(creator);
        if (creatorShare == 0) vm.expectRevert(EchoLoomHub.NothingToWithdraw.selector);
        hub.claimReward(postId, 1);
        vm.prank(curator);
        if (curatorShare == 0) vm.expectRevert(EchoLoomHub.NothingToWithdraw.selector);
        hub.claimReward(postId, 2);

        uint256 distributed = (alice.balance - aliceBefore) + (bob.balance - bobBefore) +
            (creator.balance - creatorBefore) + (curator.balance - curatorBefore);
        assertLe(distributed, funding);
        assertEq(address(hub).balance, aliceStake + bobStake + funding - distributed);
    }
    function testCannotClaimAsUnauthorizedCreatorOrCurator() public {
        vm.prank(creator); hub.fundReward{value: 1 ether}(postId); vm.warp(block.timestamp + 1 days);
        vm.prank(alice); vm.expectRevert(EchoLoomHub.Unauthorized.selector); hub.claimReward(postId, 1);
        vm.prank(alice); vm.expectRevert(EchoLoomHub.Unauthorized.selector); hub.claimReward(postId, 2);
    }
    function testPausedBlocksNewRiskButAllowsWithdrawals() public {
        vm.prank(alice); hub.stake{value: 1 ether}(postId);
        vm.prank(creator); hub.fundReward{value: 1 ether}(postId);
        vm.prank(alice); hub.tip{value: 1 ether}(payable(creator));
        hub.setPaused(true);
        vm.prank(alice); vm.expectRevert(EchoLoomHub.Paused.selector); hub.stake{value: 1 ether}(postId);
        vm.prank(alice); vm.expectRevert(EchoLoomHub.Paused.selector); hub.fundReward{value: 1 ether}(postId);
        vm.prank(alice); vm.expectRevert(EchoLoomHub.Paused.selector); hub.tip{value: 1 ether}(payable(creator));
        vm.prank(creator); vm.expectRevert(EchoLoomHub.Paused.selector);
        hub.createPost(loomId, "ipfs://paused", bytes32(0));
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice); hub.withdrawStake(postId);
        vm.prank(alice); hub.claimReward(postId, 0);
        vm.prank(creator); hub.withdrawEarnings();
    }
    function testOwnerFeeCapAndProtocolWithdrawal() public {
        vm.expectRevert(EchoLoomHub.InvalidInput.selector); hub.setTipFee(501);
        vm.prank(alice); vm.expectRevert(EchoLoomHub.Unauthorized.selector); hub.setTipFee(100);
        vm.prank(alice); hub.tip{value: 1 ether}(payable(creator));
        vm.prank(alice); vm.expectRevert(EchoLoomHub.Unauthorized.selector);
        hub.withdrawProtocolFees(payable(alice));
        uint256 before = address(this).balance; hub.withdrawProtocolFees(payable(address(this)));
        assertEq(address(this).balance, before + 0.02 ether);
    }
    function testRejectInvalidPostURIAndInactiveLoom() public {
        vm.prank(creator); vm.expectRevert(EchoLoomHub.InvalidInput.selector); hub.createPost(loomId, "", bytes32(0));
        vm.prank(curator); hub.deactivateLoom(loomId);
        vm.prank(creator); vm.expectRevert(EchoLoomHub.InvalidInput.selector); hub.createPost(loomId, "ipfs://blocked", bytes32(0));
    }
    function testPayoutRejectionPreservesCredit() public {
        RejectingReceiver receiver = new RejectingReceiver();
        vm.prank(alice); hub.tip{value: 1 ether}(payable(address(receiver)));
        vm.expectRevert(EchoLoomHub.InvalidInput.selector); receiver.withdraw(hub);
        assertEq(hub.pendingWithdrawals(address(receiver)), 0.98 ether);
    }
    function testRewardPayoutRevertRollsBackClaimState() public {
        RejectingRewardReceiver receiver = new RejectingRewardReceiver(hub);
        vm.deal(address(receiver), 1 ether);
        receiver.stake{value: 1 ether}(postId);
        vm.prank(creator); hub.fundReward{value: 1 ether}(postId);
        vm.warp(block.timestamp + 1 days);
        uint256 balanceBefore = address(hub).balance;
        vm.expectRevert(EchoLoomHub.InvalidInput.selector); receiver.claim(postId);
        assertFalse(hub.supporterClaimed(postId, address(receiver)));
        assertEq(address(hub).balance, balanceBefore);
    }
    function testReentrantReceiverCannotWithdrawTwice() public {
        ReentrantReceiver receiver = new ReentrantReceiver(hub);
        vm.prank(alice); hub.tip{value: 1 ether}(payable(address(receiver)));
        receiver.withdraw();
        assertTrue(receiver.reentryWasBlocked());
        assertEq(hub.pendingWithdrawals(address(receiver)), 0);
    }
    receive() external payable {}
}

contract RejectingReceiver {
    function withdraw(EchoLoomHub hub) external { hub.withdrawEarnings(); }
    receive() external payable { revert("no"); }
}

contract RejectingRewardReceiver {
    EchoLoomHub immutable hub;
    constructor(EchoLoomHub hub_) { hub = hub_; }
    function stake(uint256 postId) external payable { hub.stake{value: msg.value}(postId); }
    function claim(uint256 postId) external { hub.claimReward(postId, 0); }
    receive() external payable { revert("no"); }
}

contract ReentrantReceiver {
    EchoLoomHub immutable hub;
    bool public reentryWasBlocked;
    constructor(EchoLoomHub hub_) { hub = hub_; }
    function withdraw() external { hub.withdrawEarnings(); }
    receive() external payable {
        try hub.withdrawEarnings() { revert("unexpected reentry success"); }
        catch { reentryWasBlocked = true; }
    }
}
