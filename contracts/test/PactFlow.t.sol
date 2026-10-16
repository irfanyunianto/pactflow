// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {PactFlow} from "../PactFlow.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {FeeToken} from "../test-helpers/FeeToken.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Shared base: deploys MockERC20, PactFlow, mints tokens to funder
// ─────────────────────────────────────────────────────────────────────────────
contract PactFlowTestBase is Test {
    PactFlow internal pf;
    MockERC20 internal token;

    address internal funder    = makeAddr("funder");
    address internal builder   = makeAddr("builder");
    address internal arbitrator = makeAddr("arbitrator");
    address internal stranger  = makeAddr("stranger");

    uint256 internal constant MILESTONE_AMOUNT = 100e6; // 100 USDC

    // ── helpers ────────────────────────────────────────────────────────────

    /// Build an array of `n` identical MilestoneInputs (100 USDC each, deadline
    /// one week from now).
    function _milestones(uint256 n)
        internal
        view
        returns (PactFlow.MilestoneInput[] memory ms)
    {
        ms = new PactFlow.MilestoneInput[](n);
        for (uint256 i = 0; i < n; i++) {
            ms[i] = PactFlow.MilestoneInput({
                description: "Milestone",
                amount: MILESTONE_AMOUNT,
                deadline: uint64(block.timestamp + 7 days)
            });
        }
    }

    /// Create a 1-milestone agreement and return its id.
    function _createAgreement() internal returns (uint256 id) {
        vm.prank(funder);
        id = pf.createAgreement(builder, arbitrator, address(token), _milestones(1));
    }

    /// Create a `n`-milestone agreement.
    function _createAgreementN(uint256 n) internal returns (uint256 id) {
        vm.prank(funder);
        id = pf.createAgreement(builder, arbitrator, address(token), _milestones(n));
    }

    /// Fund agreement `id` (funder must have tokens and allowance).
    function _fund(uint256 id) internal {
        PactFlow.Agreement memory a = pf.getAgreement(id);
        token.mint(funder, a.totalAmount);
        vm.prank(funder);
        token.approve(address(pf), a.totalAmount);
        vm.prank(funder);
        pf.fundAgreement(id);
    }

    /// Full happy-path through one milestone: submit → approve → release.
    function _fullRelease(uint256 id, uint256 idx) internal {
        vm.prank(builder);
        pf.submitEvidence(id, idx, "https://evidence.example");
        vm.prank(funder);
        pf.approveMilestone(id, idx);
        vm.prank(funder);
        pf.releaseMilestone(id, idx);
    }

    function setUp() public virtual {
        token = new MockERC20("Mock USDC", "mUSDC", 6);
        pf    = new PactFlow(address(token));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Constructor / initialisation
// ─────────────────────────────────────────────────────────────────────────────
contract PactFlow_Constructor_Test is PactFlowTestBase {
    function test_AllowedTokenSet() public view {
        assertEq(pf.allowedToken(), address(token));
    }

    function test_AgreementCountStartsAtZero() public view {
        assertEq(pf.agreementCount(), 0);
    }

    function test_RevertWhen_AllowedTokenIsZero() public {
        vm.expectRevert(PactFlow.InvalidAddress.selector);
        new PactFlow(address(0));
    }

    function test_RevertWhen_AllowedTokenHasNoCode() public {
        address eoa = makeAddr("eoa");
        vm.expectRevert(PactFlow.InvalidToken.selector);
        new PactFlow(eoa);
    }

    function test_RevertWhen_NativeEthSent() public {
        vm.deal(funder, 1 ether);
        vm.prank(funder);
        vm.expectRevert(PactFlow.NativeEthNotAccepted.selector);
        (bool success,) = address(pf).call{value: 1 ether}("");
        // call returns false but we expect the revert to be caught by expectRevert
        (success); // silence warning
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. createAgreement – happy path & reverts
// ─────────────────────────────────────────────────────────────────────────────
contract PactFlow_CreateAgreement_Test is PactFlowTestBase {
    function test_CreateAgreement_Happy() public {
        vm.prank(funder);
        vm.expectEmit(true, true, true, true, address(pf));
        emit PactFlow.AgreementCreated(0, funder, builder, arbitrator);
        uint256 id = pf.createAgreement(builder, arbitrator, address(token), _milestones(1));

        assertEq(id, 0);
        assertEq(pf.agreementCount(), 1);

        PactFlow.Agreement memory a = pf.getAgreement(id);
        assertEq(a.funder,     funder);
        assertEq(a.builder,    builder);
        assertEq(a.arbitrator, arbitrator);
        assertEq(a.token,      address(token));
        assertEq(a.totalAmount, MILESTONE_AMOUNT);
        assertFalse(a.isFunded);
        assertEq(a.pendingCount, 1);
        assertEq(a.activeCount,  0);
    }

    function test_CreateAgreement_IncrementId() public {
        uint256 id0 = _createAgreement();
        uint256 id1 = _createAgreement();
        assertEq(id0, 0);
        assertEq(id1, 1);
        assertEq(pf.agreementCount(), 2);
    }

    // ── Role distinctness reverts ──────────────────────────────────────────

    function test_Revert_FunderEqualsBuilder() public {
        vm.prank(funder);
        vm.expectRevert(PactFlow.RolesNotDistinct.selector);
        pf.createAgreement(funder, arbitrator, address(token), _milestones(1));
    }

    function test_Revert_FunderEqualsArbitrator() public {
        vm.prank(funder);
        vm.expectRevert(PactFlow.RolesNotDistinct.selector);
        pf.createAgreement(builder, funder, address(token), _milestones(1));
    }

    function test_Revert_BuilderEqualsArbitrator() public {
        vm.prank(funder);
        vm.expectRevert(PactFlow.RolesNotDistinct.selector);
        pf.createAgreement(builder, builder, address(token), _milestones(1));
    }

    // ── Token allowlist ────────────────────────────────────────────────────

    function test_Revert_TokenNotAllowed() public {
        address otherToken = makeAddr("other");
        vm.prank(funder);
        vm.expectRevert(PactFlow.TokenNotAllowed.selector);
        pf.createAgreement(builder, arbitrator, otherToken, _milestones(1));
    }

    // ── Milestone count bounds ─────────────────────────────────────────────

    function test_Revert_TooManyMilestones_21() public {
        vm.prank(funder);
        vm.expectRevert(PactFlow.TooManyMilestones.selector);
        pf.createAgreement(builder, arbitrator, address(token), _milestones(21));
    }

    function test_Revert_ZeroMilestones() public {
        vm.prank(funder);
        vm.expectRevert(PactFlow.EmptyMilestones.selector);
        pf.createAgreement(builder, arbitrator, address(token), _milestones(0));
    }

    function test_Revert_InvalidAddress_BuilderZero() public {
        vm.prank(funder);
        vm.expectRevert(PactFlow.InvalidAddress.selector);
        pf.createAgreement(address(0), arbitrator, address(token), _milestones(1));
    }

    function test_Revert_InvalidAddress_ArbitratorZero() public {
        vm.prank(funder);
        vm.expectRevert(PactFlow.InvalidAddress.selector);
        pf.createAgreement(builder, address(0), address(token), _milestones(1));
    }

    function test_Revert_InvalidMilestoneAmount_Zero() public {
        PactFlow.MilestoneInput[] memory ms = new PactFlow.MilestoneInput[](1);
        ms[0] = PactFlow.MilestoneInput({description: "d", amount: 0, deadline: uint64(block.timestamp + 1)});
        vm.prank(funder);
        vm.expectRevert(PactFlow.InvalidMilestoneAmount.selector);
        pf.createAgreement(builder, arbitrator, address(token), ms);
    }

    function test_Revert_InvalidMilestoneDeadline_Zero() public {
        PactFlow.MilestoneInput[] memory ms = new PactFlow.MilestoneInput[](1);
        ms[0] = PactFlow.MilestoneInput({description: "d", amount: 100e6, deadline: 0});
        vm.prank(funder);
        vm.expectRevert(PactFlow.InvalidMilestoneDeadline.selector);
        pf.createAgreement(builder, arbitrator, address(token), ms);
    }

    function test_CreateAgreement_MaxMilestones_20() public {
        vm.prank(funder);
        uint256 id = pf.createAgreement(builder, arbitrator, address(token), _milestones(20));
        assertEq(pf.getMilestoneCount(id), 20);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. fundAgreement – happy path & reverts
// ─────────────────────────────────────────────────────────────────────────────
contract PactFlow_FundAgreement_Test is PactFlowTestBase {
    function test_FundAgreement_Happy() public {
        uint256 id = _createAgreement();
        uint256 total = MILESTONE_AMOUNT;

        token.mint(funder, total);
        vm.prank(funder);
        token.approve(address(pf), total);

        vm.prank(funder);
        vm.expectEmit(true, false, false, true, address(pf));
        emit PactFlow.AgreementFunded(id, total);
        pf.fundAgreement(id);

        PactFlow.Agreement memory a = pf.getAgreement(id);
        assertTrue(a.isFunded);
        assertEq(a.totalFunded, total);
        assertEq(pf.agreementBalance(id), total);
        assertEq(token.balanceOf(address(pf)), total);
    }

    function test_Revert_FundAgreement_NotFunder() public {
        uint256 id = _createAgreement();
        vm.prank(stranger);
        vm.expectRevert(PactFlow.NotFunder.selector);
        pf.fundAgreement(id);
    }

    function test_Revert_FundAgreement_AlreadyFunded() public {
        uint256 id = _createAgreement();
        _fund(id);
        vm.prank(funder);
        vm.expectRevert(PactFlow.AgreementAlreadyFunded.selector);
        pf.fundAgreement(id);
    }

    function test_Revert_FundAgreement_InvalidAgreement() public {
        vm.prank(funder);
        vm.expectRevert(PactFlow.InvalidAgreement.selector);
        pf.fundAgreement(999);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. submitEvidence
// ─────────────────────────────────────────────────────────────────────────────
contract PactFlow_SubmitEvidence_Test is PactFlowTestBase {
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        id = _createAgreement();
    }

    function test_SubmitEvidence_Happy() public {
        _fund(id);
        vm.prank(builder);
        vm.expectEmit(true, false, false, true, address(pf));
        emit PactFlow.EvidenceSubmitted(id, 0, "https://evidence.example");
        pf.submitEvidence(id, 0, "https://evidence.example");

        PactFlow.Milestone memory m = pf.getMilestone(id, 0);
        assertEq(uint8(m.status), uint8(PactFlow.MilestoneStatus.Submitted));
        assertEq(m.evidenceUrl, "https://evidence.example");
    }

    function test_Revert_SubmitEvidence_NotFunded() public {
        vm.prank(builder);
        vm.expectRevert(PactFlow.AgreementNotFunded.selector);
        pf.submitEvidence(id, 0, "https://evidence.example");
    }

    function test_Revert_SubmitEvidence_NotBuilder() public {
        _fund(id);
        vm.prank(stranger);
        vm.expectRevert(PactFlow.NotBuilder.selector);
        pf.submitEvidence(id, 0, "https://evidence.example");
    }

    function test_Revert_SubmitEvidence_FunderCannotSubmit() public {
        _fund(id);
        vm.prank(funder);
        vm.expectRevert(PactFlow.NotBuilder.selector);
        pf.submitEvidence(id, 0, "https://evidence.example");
    }

    function test_Revert_SubmitEvidence_AlreadySubmitted() public {
        _fund(id);
        vm.prank(builder);
        pf.submitEvidence(id, 0, "url1");
        vm.prank(builder);
        vm.expectRevert(PactFlow.InvalidMilestoneState.selector);
        pf.submitEvidence(id, 0, "url2");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. approveMilestone
// ─────────────────────────────────────────────────────────────────────────────
contract PactFlow_ApproveMilestone_Test is PactFlowTestBase {
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        id = _createAgreement();
        _fund(id);
    }

    function test_ApproveMilestone_Happy() public {
        vm.prank(builder);
        pf.submitEvidence(id, 0, "url");

        vm.prank(funder);
        vm.expectEmit(true, false, false, true, address(pf));
        emit PactFlow.MilestoneApproved(id, 0);
        pf.approveMilestone(id, 0);

        PactFlow.Milestone memory m = pf.getMilestone(id, 0);
        assertEq(uint8(m.status), uint8(PactFlow.MilestoneStatus.Approved));
    }

    function test_Revert_ApproveMilestone_NotFunder() public {
        vm.prank(builder);
        pf.submitEvidence(id, 0, "url");

        vm.prank(stranger);
        vm.expectRevert(PactFlow.NotFunder.selector);
        pf.approveMilestone(id, 0);
    }

    function test_Revert_ApproveMilestone_WhenPending() public {
        // Milestone is Pending (not Submitted) → InvalidMilestoneState
        vm.prank(funder);
        vm.expectRevert(PactFlow.InvalidMilestoneState.selector);
        pf.approveMilestone(id, 0);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. releaseMilestone
// ─────────────────────────────────────────────────────────────────────────────
contract PactFlow_ReleaseMilestone_Test is PactFlowTestBase {
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        id = _createAgreement();
        _fund(id);
    }

    function test_ReleaseMilestone_Happy() public {
        vm.prank(builder);
        pf.submitEvidence(id, 0, "url");
        vm.prank(funder);
        pf.approveMilestone(id, 0);

        uint256 pendingBefore = pf.pendingWithdrawals(builder);
        uint256 balBefore = pf.agreementBalance(id);

        vm.prank(funder);
        vm.expectEmit(true, false, false, true, address(pf));
        emit PactFlow.MilestoneReleased(id, 0, MILESTONE_AMOUNT, builder);
        pf.releaseMilestone(id, 0);

        assertEq(pf.pendingWithdrawals(builder), pendingBefore + MILESTONE_AMOUNT);
        assertEq(pf.agreementBalance(id), balBefore - MILESTONE_AMOUNT);

        PactFlow.Milestone memory m = pf.getMilestone(id, 0);
        assertEq(uint8(m.status), uint8(PactFlow.MilestoneStatus.Released));
        assertTrue(m.fundsReleased);
    }

    function test_Revert_ReleaseMilestone_NotFunder() public {
        vm.prank(builder);
        pf.submitEvidence(id, 0, "url");
        vm.prank(funder);
        pf.approveMilestone(id, 0);

        vm.prank(stranger);
        vm.expectRevert(PactFlow.NotFunder.selector);
        pf.releaseMilestone(id, 0);
    }

    function test_Revert_ReleaseMilestone_WhenSubmittedNotApproved() public {
        vm.prank(builder);
        pf.submitEvidence(id, 0, "url");

        // status is Submitted, not Approved → InvalidMilestoneState
        vm.prank(funder);
        vm.expectRevert(PactFlow.InvalidMilestoneState.selector);
        pf.releaseMilestone(id, 0);
    }

    function test_Revert_ReleaseMilestone_Twice() public {
        // Use a 2-milestone agreement so the agreement stays Active after the
        // first release (a 1-milestone agreement transitions to Completed, which
        // would surface AgreementNotActive before AlreadyReleased).
        uint256 id2 = _createAgreementN(2);
        _fund(id2);

        vm.prank(builder);
        pf.submitEvidence(id2, 0, "url");
        vm.prank(funder);
        pf.approveMilestone(id2, 0);
        vm.prank(funder);
        pf.releaseMilestone(id2, 0);

        // Agreement still Active (milestone 1 is Pending).
        // Second release of milestone 0 → AlreadyReleased.
        vm.prank(funder);
        vm.expectRevert(PactFlow.AlreadyReleased.selector);
        pf.releaseMilestone(id2, 0);
    }

    function test_Revert_ReleaseMilestone_WhenPending() public {
        vm.prank(funder);
        vm.expectRevert(PactFlow.InvalidMilestoneState.selector);
        pf.releaseMilestone(id, 0);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. withdraw
// ─────────────────────────────────────────────────────────────────────────────
contract PactFlow_Withdraw_Test is PactFlowTestBase {
    function test_Withdraw_Happy() public {
        uint256 id = _createAgreement();
        _fund(id);
        _fullRelease(id, 0);

        uint256 pending = pf.pendingWithdrawals(builder);
        assertEq(pending, MILESTONE_AMOUNT);

        // builder has no tokens yet
        assertEq(token.balanceOf(builder), 0);

        vm.prank(builder);
        vm.expectEmit(true, false, false, true, address(pf));
        emit PactFlow.Withdrawn(builder, MILESTONE_AMOUNT);
        pf.withdraw();

        assertEq(token.balanceOf(builder), MILESTONE_AMOUNT);
        assertEq(pf.pendingWithdrawals(builder), 0);
    }

    function test_Withdraw_NothingToWithdraw() public {
        vm.prank(builder);
        vm.expectRevert(PactFlow.NothingToWithdraw.selector);
        pf.withdraw();
    }

    function test_Withdraw_PendingWithdrawals_ZeroAfterWithdraw() public {
        uint256 id = _createAgreement();
        _fund(id);
        _fullRelease(id, 0);

        vm.prank(builder);
        pf.withdraw();
        assertEq(pf.pendingWithdrawals(builder), 0);
    }

    function test_Withdraw_PullPayment_BuilderHasNothingUntilWithdraw() public {
        uint256 id = _createAgreement();
        _fund(id);
        _fullRelease(id, 0);

        // Builder has not called withdraw() — token balance should be 0
        assertEq(token.balanceOf(builder), 0);
        // But pending is recorded
        assertEq(pf.pendingWithdrawals(builder), MILESTONE_AMOUNT);
    }

    function test_Withdraw_AccumulatesMultipleReleases() public {
        // 3 milestones, release all, single withdraw
        uint256 id = _createAgreementN(3);
        _fund(id);
        for (uint256 i = 0; i < 3; i++) {
            _fullRelease(id, i);
        }

        // Accumulated before withdraw
        assertEq(pf.pendingWithdrawals(builder), 3 * MILESTONE_AMOUNT);

        vm.prank(builder);
        pf.withdraw();

        assertEq(token.balanceOf(builder), 3 * MILESTONE_AMOUNT);
        assertEq(pf.pendingWithdrawals(builder), 0);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Full happy-path flows
// ─────────────────────────────────────────────────────────────────────────────
contract PactFlow_HappyPath_Test is PactFlowTestBase {
    function test_HappyPath_OneMilestone_EndToEnd() public {
        uint256 id = _createAgreement();
        _fund(id);
        _fullRelease(id, 0);

        // Agreement should be Completed since all milestones done
        PactFlow.Agreement memory a = pf.getAgreement(id);
        assertEq(uint8(a.status), uint8(PactFlow.AgreementStatus.Completed));
        assertEq(pf.agreementBalance(id), 0);

        vm.prank(builder);
        pf.withdraw();
        assertEq(token.balanceOf(builder), MILESTONE_AMOUNT);
    }

    function test_HappyPath_ThreeMilestones_AllReleased() public {
        uint256 id = _createAgreementN(3);
        _fund(id);

        assertEq(pf.agreementBalance(id), 3 * MILESTONE_AMOUNT);

        for (uint256 i = 0; i < 3; i++) {
            _fullRelease(id, i);
        }

        assertEq(pf.agreementBalance(id), 0);

        PactFlow.Agreement memory a = pf.getAgreement(id);
        assertEq(uint8(a.status), uint8(PactFlow.AgreementStatus.Completed));

        vm.prank(builder);
        pf.withdraw();
        assertEq(token.balanceOf(builder), 3 * MILESTONE_AMOUNT);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. raiseDispute
// ─────────────────────────────────────────────────────────────────────────────
contract PactFlow_RaiseDispute_Test is PactFlowTestBase {
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        id = _createAgreement();
        _fund(id);
        vm.prank(builder);
        pf.submitEvidence(id, 0, "url");
    }

    function test_RaiseDispute_ByFunder_Happy() public {
        vm.prank(funder);
        vm.expectEmit(true, false, false, true, address(pf));
        emit PactFlow.DisputeRaised(id, 0, funder);
        pf.raiseDispute(id, 0);

        PactFlow.Milestone memory m = pf.getMilestone(id, 0);
        assertEq(uint8(m.status), uint8(PactFlow.MilestoneStatus.Disputed));
        assertGt(m.disputeDeadline, block.timestamp);
    }

    function test_RaiseDispute_ByBuilder_Happy() public {
        vm.prank(builder);
        vm.expectEmit(true, false, false, true, address(pf));
        emit PactFlow.DisputeRaised(id, 0, builder);
        pf.raiseDispute(id, 0);

        PactFlow.Milestone memory m = pf.getMilestone(id, 0);
        assertEq(uint8(m.status), uint8(PactFlow.MilestoneStatus.Disputed));
    }

    function test_Revert_RaiseDispute_NotParticipant() public {
        vm.prank(stranger);
        vm.expectRevert(PactFlow.NotParticipant.selector);
        pf.raiseDispute(id, 0);
    }

    function test_Revert_RaiseDispute_Arbitrator_NotParticipant() public {
        // Arbitrator is not a "participant" for dispute raising
        vm.prank(arbitrator);
        vm.expectRevert(PactFlow.NotParticipant.selector);
        pf.raiseDispute(id, 0);
    }

    function test_Revert_RaiseDispute_OnReleasedMilestone() public {
        // Use a 2-milestone agreement so the agreement stays Active after the
        // first release. A 1-milestone agreement transitions to Completed on
        // release, which surfaces AgreementNotActive before InvalidMilestoneState.
        uint256 id2 = _createAgreementN(2);
        _fund(id2);

        vm.prank(builder);
        pf.submitEvidence(id2, 0, "url");
        vm.prank(funder);
        pf.approveMilestone(id2, 0);
        vm.prank(funder);
        pf.releaseMilestone(id2, 0);

        // Agreement still Active (milestone 1 is Pending).
        // Raising dispute on the already-Released milestone → InvalidMilestoneState.
        vm.prank(funder);
        vm.expectRevert(PactFlow.InvalidMilestoneState.selector);
        pf.raiseDispute(id2, 0);
    }

    function test_Revert_RaiseDispute_OnPendingMilestone() public {
        // Create a second milestone that is still Pending
        uint256 id2 = _createAgreementN(2);
        _fund(id2);

        vm.prank(funder);
        vm.expectRevert(PactFlow.InvalidMilestoneState.selector);
        pf.raiseDispute(id2, 0); // index 0 is Pending
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. resolveDispute
// ─────────────────────────────────────────────────────────────────────────────
contract PactFlow_ResolveDispute_Test is PactFlowTestBase {
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        id = _createAgreement();
        _fund(id);
        vm.prank(builder);
        pf.submitEvidence(id, 0, "url");
        vm.prank(funder);
        pf.raiseDispute(id, 0);
    }

    function test_ResolveDispute_FavorBuilder() public {
        uint256 pendingBefore = pf.pendingWithdrawals(builder);

        vm.prank(arbitrator);
        vm.expectEmit(true, false, false, true, address(pf));
        emit PactFlow.DisputeResolved(id, 0, false);
        pf.resolveDispute(id, 0, false);

        assertEq(pf.pendingWithdrawals(builder), pendingBefore + MILESTONE_AMOUNT);
        assertEq(pf.agreementBalance(id), 0);

        PactFlow.Milestone memory m = pf.getMilestone(id, 0);
        assertEq(uint8(m.status), uint8(PactFlow.MilestoneStatus.Released));
    }

    function test_ResolveDispute_FavorFunder() public {
        uint256 pendingBefore = pf.pendingWithdrawals(funder);

        vm.prank(arbitrator);
        vm.expectEmit(true, false, false, true, address(pf));
        emit PactFlow.DisputeResolved(id, 0, true);
        pf.resolveDispute(id, 0, true);

        assertEq(pf.pendingWithdrawals(funder), pendingBefore + MILESTONE_AMOUNT);
        assertEq(pf.agreementBalance(id), 0);

        PactFlow.Milestone memory m = pf.getMilestone(id, 0);
        assertEq(uint8(m.status), uint8(PactFlow.MilestoneStatus.Refunded));
    }

    function test_Revert_ResolveDispute_NotArbitrator() public {
        vm.prank(stranger);
        vm.expectRevert(PactFlow.NotArbitrator.selector);
        pf.resolveDispute(id, 0, false);
    }

    function test_Revert_ResolveDispute_NotArbitrator_ByFunder() public {
        vm.prank(funder);
        vm.expectRevert(PactFlow.NotArbitrator.selector);
        pf.resolveDispute(id, 0, false);
    }

    function test_Revert_ResolveDispute_MilestoneNotDisputed() public {
        // Create fresh agreement in Submitted state
        uint256 id2 = _createAgreement();
        _fund(id2);
        vm.prank(builder);
        pf.submitEvidence(id2, 0, "url");

        vm.prank(arbitrator);
        vm.expectRevert(PactFlow.InvalidMilestoneState.selector);
        pf.resolveDispute(id2, 0, false);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. escalateExpiredDispute
// ─────────────────────────────────────────────────────────────────────────────
contract PactFlow_EscalateExpiredDispute_Test is PactFlowTestBase {
    uint256 internal id;
    uint64 internal disputeDeadline;

    function setUp() public override {
        super.setUp();
        id = _createAgreement();
        _fund(id);
        vm.prank(builder);
        pf.submitEvidence(id, 0, "url");
        vm.prank(funder);
        pf.raiseDispute(id, 0);
        disputeDeadline = pf.getMilestone(id, 0).disputeDeadline;
    }

    function test_Revert_EscalateExpiredDispute_BeforeDeadline() public {
        // Still before the disputeDeadline
        vm.warp(disputeDeadline - 1);
        vm.expectRevert(PactFlow.InvalidMilestoneState.selector);
        pf.escalateExpiredDispute(id, 0);
    }

    function test_EscalateExpiredDispute_AfterDeadline_FundsGoToFunder() public {
        // Warp past the dispute deadline
        vm.warp(uint256(disputeDeadline) + 1);

        uint256 pendingBefore = pf.pendingWithdrawals(funder);

        vm.expectEmit(true, false, false, true, address(pf));
        emit PactFlow.MilestoneRefunded(id, 0, MILESTONE_AMOUNT);
        pf.escalateExpiredDispute(id, 0);

        assertEq(pf.pendingWithdrawals(funder), pendingBefore + MILESTONE_AMOUNT);
        assertEq(pf.agreementBalance(id), 0);

        PactFlow.Milestone memory m = pf.getMilestone(id, 0);
        assertEq(uint8(m.status), uint8(PactFlow.MilestoneStatus.Refunded));
        assertTrue(m.fundsReleased);
    }

    function test_Revert_EscalateExpiredDispute_NotDisputed() public {
        // A Pending milestone cannot be escalated
        uint256 id2 = _createAgreementN(2);
        _fund(id2);
        // milestone[1] is still Pending
        vm.expectRevert(PactFlow.InvalidMilestoneState.selector);
        pf.escalateExpiredDispute(id2, 1);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. cancelAgreement
// ─────────────────────────────────────────────────────────────────────────────
contract PactFlow_CancelAgreement_Test is PactFlowTestBase {
    function test_Cancel_AllPending_Funded_RefundsFunder() public {
        uint256 id = _createAgreementN(2);
        _fund(id);

        uint256 total = 2 * MILESTONE_AMOUNT;
        uint256 pendingBefore = pf.pendingWithdrawals(funder);

        vm.prank(funder);
        vm.expectEmit(true, false, false, false, address(pf));
        emit PactFlow.AgreementCancelled(id);
        pf.cancelAgreement(id);

        assertEq(pf.pendingWithdrawals(funder), pendingBefore + total);
        assertEq(pf.agreementBalance(id), 0);

        PactFlow.Agreement memory a = pf.getAgreement(id);
        assertEq(uint8(a.status), uint8(PactFlow.AgreementStatus.Cancelled));
    }

    function test_Cancel_BeforeFunding_Works() public {
        // Unfunded agreement, all milestones Pending → can cancel (no refund needed)
        uint256 id = _createAgreement();

        vm.prank(funder);
        pf.cancelAgreement(id);

        PactFlow.Agreement memory a = pf.getAgreement(id);
        assertEq(uint8(a.status), uint8(PactFlow.AgreementStatus.Cancelled));
        // No funds were ever in the contract
        assertEq(pf.agreementBalance(id), 0);
        assertEq(pf.pendingWithdrawals(funder), 0);
    }

    function test_Cancel_PartialRelease_OnlyPendingRefunded() public {
        // 3 milestones: release first, cancel with 2 remaining pending
        uint256 id = _createAgreementN(3);
        _fund(id);

        // Release milestone 0
        _fullRelease(id, 0);

        // Cancel — milestones 1 & 2 are Pending
        uint256 pendingBefore = pf.pendingWithdrawals(funder);
        vm.prank(funder);
        pf.cancelAgreement(id);

        assertEq(pf.pendingWithdrawals(funder), pendingBefore + 2 * MILESTONE_AMOUNT);
        assertEq(pf.agreementBalance(id), 0);
    }

    function test_Revert_Cancel_ActiveMilestone_Submitted() public {
        // submitEvidence increments activeCount → cancelAgreement must revert
        uint256 id = _createAgreement();
        _fund(id);

        vm.prank(builder);
        pf.submitEvidence(id, 0, "url");

        vm.prank(funder);
        vm.expectRevert(PactFlow.CancellationNotAllowed.selector);
        pf.cancelAgreement(id);
    }

    function test_Revert_Cancel_NotFunder() public {
        uint256 id = _createAgreement();
        vm.prank(stranger);
        vm.expectRevert(PactFlow.NotFunder.selector);
        pf.cancelAgreement(id);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. claimExpiredMilestone
// ─────────────────────────────────────────────────────────────────────────────
contract PactFlow_ClaimExpiredMilestone_Test is PactFlowTestBase {
    uint256 internal id;
    uint64 internal milestoneDeadline;

    function setUp() public override {
        super.setUp();
        id = _createAgreement();
        _fund(id);
        milestoneDeadline = pf.getMilestone(id, 0).deadline;
    }

    function test_ClaimExpiredMilestone_Happy() public {
        vm.warp(uint256(milestoneDeadline) + 1);

        uint256 pendingBefore = pf.pendingWithdrawals(funder);

        vm.prank(funder);
        vm.expectEmit(true, false, false, true, address(pf));
        emit PactFlow.MilestoneRefunded(id, 0, MILESTONE_AMOUNT);
        pf.claimExpiredMilestone(id, 0);

        assertEq(pf.pendingWithdrawals(funder), pendingBefore + MILESTONE_AMOUNT);
        assertEq(pf.agreementBalance(id), 0);

        PactFlow.Milestone memory m = pf.getMilestone(id, 0);
        assertEq(uint8(m.status), uint8(PactFlow.MilestoneStatus.Refunded));
        assertTrue(m.fundsReleased);
    }

    function test_Revert_ClaimExpiredMilestone_BeforeDeadline() public {
        vm.prank(funder);
        vm.expectRevert(PactFlow.DeadlineNotPassed.selector);
        pf.claimExpiredMilestone(id, 0);
    }

    function test_Revert_ClaimExpiredMilestone_AtDeadline() public {
        vm.warp(milestoneDeadline); // block.timestamp == deadline → NOT passed
        vm.prank(funder);
        vm.expectRevert(PactFlow.DeadlineNotPassed.selector);
        pf.claimExpiredMilestone(id, 0);
    }

    function test_Revert_ClaimExpiredMilestone_NotFunder() public {
        vm.warp(uint256(milestoneDeadline) + 1);
        vm.prank(stranger);
        vm.expectRevert(PactFlow.NotFunder.selector);
        pf.claimExpiredMilestone(id, 0);
    }

    function test_Revert_ClaimExpiredMilestone_NotPending() public {
        // Submit evidence → status is Submitted, not Pending
        vm.prank(builder);
        pf.submitEvidence(id, 0, "url");

        vm.warp(uint256(milestoneDeadline) + 1);
        vm.prank(funder);
        vm.expectRevert(PactFlow.MilestoneNotPending.selector);
        pf.claimExpiredMilestone(id, 0);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. Fee-on-transfer protection
// ─────────────────────────────────────────────────────────────────────────────
contract PactFlow_FeeOnTransfer_Test is Test {
    function test_FeeOnTransfer_Reverts() public {
        FeeToken feeToken = new FeeToken();
        // Deploy PactFlow with the fee token as the allowed token
        PactFlow pf2 = new PactFlow(address(feeToken));

        address funder2    = makeAddr("funder2");
        address builder2   = makeAddr("builder2");
        address arbitrator2 = makeAddr("arbitrator2");

        PactFlow.MilestoneInput[] memory ms = new PactFlow.MilestoneInput[](1);
        ms[0] = PactFlow.MilestoneInput({
            description: "d",
            amount: 100e18,
            deadline: uint64(block.timestamp + 7 days)
        });

        vm.prank(funder2);
        uint256 id = pf2.createAgreement(builder2, arbitrator2, address(feeToken), ms);

        feeToken.mint(funder2, 100e18);
        vm.prank(funder2);
        feeToken.approve(address(pf2), 100e18);

        vm.prank(funder2);
        vm.expectRevert(PactFlow.FeeOnTransferNotSupported.selector);
        pf2.fundAgreement(id);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. Accounting invariants (fuzz)
// ─────────────────────────────────────────────────────────────────────────────
contract PactFlow_Fuzz_Test is PactFlowTestBase {
    /// After funding, agreementBalance == sum of milestone amounts.
    function testFuzz_AgreementBalance_EqualsSumOfMilestones(
        uint8 numMilestones,
        uint128 amountSeed
    ) public {
        numMilestones = uint8(bound(numMilestones, 1, 20));
        uint256 amount = bound(amountSeed, 1, 1e12); // per-milestone amount

        PactFlow.MilestoneInput[] memory ms = new PactFlow.MilestoneInput[](numMilestones);
        uint256 expectedTotal = 0;
        for (uint256 i = 0; i < numMilestones; i++) {
            ms[i] = PactFlow.MilestoneInput({
                description: "m",
                amount: amount,
                deadline: uint64(block.timestamp + 7 days)
            });
            expectedTotal += amount;
        }

        vm.prank(funder);
        uint256 id = pf.createAgreement(builder, arbitrator, address(token), ms);

        token.mint(funder, expectedTotal);
        vm.prank(funder);
        token.approve(address(pf), expectedTotal);
        vm.prank(funder);
        pf.fundAgreement(id);

        assertEq(pf.agreementBalance(id), expectedTotal);
    }

    /// pendingWithdrawals[builder] increments exactly by milestone amount on release.
    function testFuzz_PendingWithdrawals_IncrementOnRelease(uint128 amountSeed) public {
        uint256 amount = bound(amountSeed, 1, 1e12);

        PactFlow.MilestoneInput[] memory ms = new PactFlow.MilestoneInput[](1);
        ms[0] = PactFlow.MilestoneInput({
            description: "m",
            amount: amount,
            deadline: uint64(block.timestamp + 7 days)
        });

        vm.prank(funder);
        uint256 id = pf.createAgreement(builder, arbitrator, address(token), ms);

        token.mint(funder, amount);
        vm.prank(funder);
        token.approve(address(pf), amount);
        vm.prank(funder);
        pf.fundAgreement(id);

        uint256 pendingBefore = pf.pendingWithdrawals(builder);

        vm.prank(builder);
        pf.submitEvidence(id, 0, "url");
        vm.prank(funder);
        pf.approveMilestone(id, 0);
        vm.prank(funder);
        pf.releaseMilestone(id, 0);

        assertEq(pf.pendingWithdrawals(builder), pendingBefore + amount);
    }

    /// After withdraw(), pendingWithdrawals[caller] == 0 and token received == amount.
    function testFuzz_Withdraw_ZeroesBalanceAndTransfersTokens(uint128 amountSeed) public {
        uint256 amount = bound(amountSeed, 1, 1e12);

        PactFlow.MilestoneInput[] memory ms = new PactFlow.MilestoneInput[](1);
        ms[0] = PactFlow.MilestoneInput({
            description: "m",
            amount: amount,
            deadline: uint64(block.timestamp + 7 days)
        });

        vm.prank(funder);
        uint256 id = pf.createAgreement(builder, arbitrator, address(token), ms);

        token.mint(funder, amount);
        vm.prank(funder);
        token.approve(address(pf), amount);
        vm.prank(funder);
        pf.fundAgreement(id);

        vm.prank(builder);
        pf.submitEvidence(id, 0, "url");
        vm.prank(funder);
        pf.approveMilestone(id, 0);
        vm.prank(funder);
        pf.releaseMilestone(id, 0);

        uint256 tokenBefore = token.balanceOf(builder);
        vm.prank(builder);
        pf.withdraw();

        assertEq(pf.pendingWithdrawals(builder), 0);
        assertEq(token.balanceOf(builder), tokenBefore + amount);
    }

    /// agreementBalance decrements by exactly the released amount on each releaseMilestone.
    function testFuzz_AgreementBalance_DecrementsOnRelease(uint8 n, uint128 amountSeed) public {
        n = uint8(bound(n, 1, 5));
        uint256 amount = bound(amountSeed, 1, 1e10);

        PactFlow.MilestoneInput[] memory ms = new PactFlow.MilestoneInput[](n);
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < n; i++) {
            ms[i] = PactFlow.MilestoneInput({
                description: "m",
                amount: amount,
                deadline: uint64(block.timestamp + 7 days)
            });
            totalAmount += amount;
        }

        vm.prank(funder);
        uint256 id = pf.createAgreement(builder, arbitrator, address(token), ms);

        token.mint(funder, totalAmount);
        vm.prank(funder);
        token.approve(address(pf), totalAmount);
        vm.prank(funder);
        pf.fundAgreement(id);

        for (uint256 i = 0; i < n; i++) {
            uint256 balBefore = pf.agreementBalance(id);
            vm.prank(builder);
            pf.submitEvidence(id, i, "url");
            vm.prank(funder);
            pf.approveMilestone(id, i);
            vm.prank(funder);
            pf.releaseMilestone(id, i);
            assertEq(pf.agreementBalance(id), balBefore - amount);
        }

        assertEq(pf.agreementBalance(id), 0);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 16. Invariant: token balance of PactFlow == sum of agreementBalances
// ─────────────────────────────────────────────────────────────────────────────
contract PactFlowHandler is Test {
    PactFlow public pf;
    MockERC20 public token;

    address public funder    = makeAddr("inv_funder");
    address public builder   = makeAddr("inv_builder");
    address public arbitrator = makeAddr("inv_arbitrator");

    uint256 public currentId;
    bool public agreementFunded;
    bool public milestoneSubmitted;
    bool public milestoneApproved;

    // Ghost: sum of what we expect PactFlow to hold
    uint256 public ghostExpected;

    constructor(PactFlow _pf, MockERC20 _token) {
        pf = _pf;
        token = _token;
    }

    function createAndFundAgreement(uint128 amount) external {
        amount = uint128(bound(amount, 1, 1e10));
        if (agreementFunded) return; // one agreement at a time for simplicity

        PactFlow.MilestoneInput[] memory ms = new PactFlow.MilestoneInput[](1);
        ms[0] = PactFlow.MilestoneInput({
            description: "m",
            amount: amount,
            deadline: uint64(block.timestamp + 7 days)
        });

        vm.prank(funder);
        currentId = pf.createAgreement(builder, arbitrator, address(token), ms);

        token.mint(funder, amount);
        vm.prank(funder);
        token.approve(address(pf), amount);
        vm.prank(funder);
        pf.fundAgreement(currentId);

        ghostExpected += amount;
        agreementFunded = true;
        milestoneSubmitted = false;
        milestoneApproved = false;
    }

    function submitAndApproveAndRelease() external {
        if (!agreementFunded) return;
        if (milestoneSubmitted) return;

        uint256 milestoneAmount = pf.getMilestone(currentId, 0).amount;

        vm.prank(builder);
        pf.submitEvidence(currentId, 0, "url");
        vm.prank(funder);
        pf.approveMilestone(currentId, 0);
        vm.prank(funder);
        pf.releaseMilestone(currentId, 0);

        ghostExpected -= milestoneAmount;
        milestoneSubmitted = true;
        milestoneApproved = true;
    }

    function withdraw() external {
        uint256 pending = pf.pendingWithdrawals(builder);
        if (pending == 0) return;
        vm.prank(builder);
        pf.withdraw();
        // Token leaves PactFlow contract — ghostExpected already decremented on release
    }
}

contract PactFlow_Invariant_Test is Test {
    PactFlow internal pf;
    MockERC20 internal token;
    PactFlowHandler internal handler;

    function setUp() public {
        token   = new MockERC20("Mock USDC", "mUSDC", 6);
        pf      = new PactFlow(address(token));
        handler = new PactFlowHandler(pf, token);
        targetContract(address(handler));
    }

    /// INVARIANT: PactFlow's token balance >= sum of all agreementBalances tracked
    /// by the handler's ghost variable.
    function invariant_TokenBalanceCoversAgreementBalances() public view {
        assertGe(
            token.balanceOf(address(pf)),
            handler.ghostExpected(),
            "PactFlow token balance below expected agreement balances"
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 17. Miscellaneous edge cases
// ─────────────────────────────────────────────────────────────────────────────
contract PactFlow_EdgeCases_Test is PactFlowTestBase {
    /// getAgreement reverts for invalid id
    function test_GetAgreement_InvalidId() public {
        vm.expectRevert(PactFlow.InvalidAgreement.selector);
        pf.getAgreement(999);
    }

    /// getMilestone reverts for out-of-bounds index
    function test_GetMilestone_InvalidIndex() public {
        uint256 id = _createAgreement();
        vm.expectRevert(PactFlow.InvalidMilestoneIndex.selector);
        pf.getMilestone(id, 1);
    }

    /// Builder raises dispute on an Approved milestone (valid per contract logic)
    function test_RaiseDispute_OnApprovedMilestone() public {
        uint256 id = _createAgreement();
        _fund(id);
        vm.prank(builder);
        pf.submitEvidence(id, 0, "url");
        vm.prank(funder);
        pf.approveMilestone(id, 0);

        vm.prank(builder);
        vm.expectEmit(true, false, false, true, address(pf));
        emit PactFlow.DisputeRaised(id, 0, builder);
        pf.raiseDispute(id, 0);

        PactFlow.Milestone memory m = pf.getMilestone(id, 0);
        assertEq(uint8(m.status), uint8(PactFlow.MilestoneStatus.Disputed));
    }

    /// getMilestoneCount returns correct value
    function test_GetMilestoneCount() public {
        uint256 id = _createAgreementN(3);
        assertEq(pf.getMilestoneCount(id), 3);
    }

    /// After cancelAgreement, agreement is no longer Active → further calls revert
    function test_CannotSubmitEvidence_AfterCancellation() public {
        uint256 id = _createAgreement();
        _fund(id);
        vm.prank(funder);
        pf.cancelAgreement(id); // activeCount==0 (Pending milestone), should succeed

        vm.prank(builder);
        vm.expectRevert(PactFlow.AgreementNotActive.selector);
        pf.submitEvidence(id, 0, "url");
    }

    /// Dispute builder path: builder raises, arbitrator resolves favorFunder=true
    /// → funder's pendingWithdrawals increases
    function test_DisputeFlow_BuilderRaises_FunderWins() public {
        uint256 id = _createAgreement();
        _fund(id);
        vm.prank(builder);
        pf.submitEvidence(id, 0, "url");
        vm.prank(builder);
        pf.raiseDispute(id, 0);

        uint256 funderPendingBefore = pf.pendingWithdrawals(funder);
        vm.prank(arbitrator);
        pf.resolveDispute(id, 0, true);

        assertEq(pf.pendingWithdrawals(funder), funderPendingBefore + MILESTONE_AMOUNT);
    }

    /// After full release of all milestones, agreement.status == Completed
    function test_AgreementCompletedAfterAllReleased() public {
        uint256 id = _createAgreementN(2);
        _fund(id);
        _fullRelease(id, 0);
        _fullRelease(id, 1);

        PactFlow.Agreement memory a = pf.getAgreement(id);
        assertEq(uint8(a.status), uint8(PactFlow.AgreementStatus.Completed));
    }
}
