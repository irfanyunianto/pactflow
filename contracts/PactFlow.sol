// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PactFlow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum AgreementStatus {
        Active,
        Completed,
        Cancelled
    }

    enum MilestoneStatus {
        Pending,
        Submitted,
        Approved,
        Released,
        Disputed,
        Refunded
    }

    struct Milestone {
        string description;
        uint256 amount;
        uint64 deadline;
        uint64 disputeDeadline;
        MilestoneStatus status;
        string evidenceUrl;
        bool fundsReleased;
    }

    struct MilestoneInput {
        string description;
        uint256 amount;
        uint64 deadline;
    }

    struct Agreement {
        address funder;
        address builder;
        address arbitrator;
        address token;
        AgreementStatus status;
        Milestone[] milestones;
        uint256 totalAmount;
        uint256 totalFunded;
        uint256 pendingCount;
        uint256 activeCount;
        bool isFunded;
    }

    error NotFunder();
    error NotBuilder();
    error NotArbitrator();
    error NotParticipant();
    error InvalidAgreement();
    error InvalidMilestoneIndex();
    error InvalidAddress();
    error EmptyMilestones();
    error InvalidMilestoneAmount();
    error InvalidMilestoneDeadline();
    error AgreementNotActive();
    error AgreementAlreadyFunded();
    error AgreementNotFunded();
    error InvalidMilestoneState();
    error AlreadyReleased();
    error CancellationNotAllowed();
    error NativeEthNotAccepted();
    error FeeOnTransferNotSupported();
    error RolesNotDistinct();
    error TokenNotAllowed();
    error TooManyMilestones();
    error InvalidToken();
    error DeadlineNotPassed();
    error MilestoneNotPending();
    error NothingToWithdraw();

    uint256 public constant MAX_MILESTONES = 20;
    address public immutable allowedToken;
    uint256 public agreementCount;
    mapping(uint256 => Agreement) public agreements;
    mapping(uint256 => uint256) public agreementBalance;
    mapping(address => uint256) public pendingWithdrawals;

    event AgreementCreated(uint256 indexed agreementId, address indexed funder, address indexed builder, address arbitrator);
    event AgreementFunded(uint256 indexed agreementId, uint256 amount);
    event EvidenceSubmitted(uint256 indexed agreementId, uint256 milestoneIndex, string evidenceUrl);
    event MilestoneApproved(uint256 indexed agreementId, uint256 milestoneIndex);
    event MilestoneReleased(uint256 indexed agreementId, uint256 milestoneIndex, uint256 amount, address recipient);
    event DisputeRaised(uint256 indexed agreementId, uint256 milestoneIndex, address raisedBy);
    event DisputeResolved(uint256 indexed agreementId, uint256 milestoneIndex, bool favorFunder);
    event AgreementCancelled(uint256 indexed agreementId);
    event MilestoneRefunded(uint256 indexed agreementId, uint256 milestoneIndex, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);

    constructor(address _allowedToken) {
        if (_allowedToken == address(0)) revert InvalidAddress();
        if (_allowedToken.code.length == 0) revert InvalidToken();
        allowedToken = _allowedToken;
    }

    receive() external payable {
        revert NativeEthNotAccepted();
    }

    fallback() external payable {
        revert NativeEthNotAccepted();
    }

    function createAgreement(
        address builder,
        address arbitrator,
        address token,
        MilestoneInput[] calldata milestones
    ) external returns (uint256 agreementId) {
        if (builder == address(0) || arbitrator == address(0)) revert InvalidAddress();
        if (msg.sender == builder || msg.sender == arbitrator || builder == arbitrator) revert RolesNotDistinct();
        if (token != allowedToken) revert TokenNotAllowed();
        if (milestones.length == 0) revert EmptyMilestones();
        if (milestones.length > MAX_MILESTONES) revert TooManyMilestones();

        agreementId = agreementCount;
        agreementCount = agreementId + 1;

        Agreement storage agreement = agreements[agreementId];
        agreement.funder = msg.sender;
        agreement.builder = builder;
        agreement.arbitrator = arbitrator;
        agreement.token = token;
        agreement.status = AgreementStatus.Active;

        uint256 length = milestones.length;
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < length; i++) {
            MilestoneInput calldata inputMilestone = milestones[i];
            if (inputMilestone.amount == 0) revert InvalidMilestoneAmount();
            if (inputMilestone.deadline == 0) revert InvalidMilestoneDeadline();

            agreement.milestones.push(
                Milestone({
                    description: inputMilestone.description,
                    amount: inputMilestone.amount,
                    deadline: inputMilestone.deadline,
                    disputeDeadline: 0,
                    status: MilestoneStatus.Pending,
                    evidenceUrl: "",
                    fundsReleased: false
                })
            );

            totalAmount += inputMilestone.amount;
            agreement.pendingCount += 1;
        }

        agreement.totalAmount = totalAmount;

        emit AgreementCreated(agreementId, msg.sender, builder, arbitrator);
    }

    function fundAgreement(uint256 agreementId) external nonReentrant {
        Agreement storage agreement = _getAgreement(agreementId);
        if (msg.sender != agreement.funder) revert NotFunder();
        if (agreement.status != AgreementStatus.Active) revert AgreementNotActive();
        if (agreement.isFunded) revert AgreementAlreadyFunded();

        uint256 totalAmount = agreement.totalAmount;
        uint256 balanceBefore = IERC20(agreement.token).balanceOf(address(this));

        IERC20(agreement.token).safeTransferFrom(msg.sender, address(this), totalAmount);

        uint256 received = IERC20(agreement.token).balanceOf(address(this)) - balanceBefore;
        if (received != totalAmount) revert FeeOnTransferNotSupported();

        agreement.isFunded = true;
        agreement.totalFunded = totalAmount;
        agreementBalance[agreementId] += totalAmount;

        emit AgreementFunded(agreementId, totalAmount);
    }

    function submitEvidence(uint256 agreementId, uint256 milestoneIndex, string calldata evidenceUrl) external {
        Agreement storage agreement = _getAgreement(agreementId);
        _requireActive(agreement);
        if (!agreement.isFunded) revert AgreementNotFunded();
        if (msg.sender != agreement.builder) revert NotBuilder();

        Milestone storage milestone = _getMilestone(agreement, milestoneIndex);
        if (milestone.status != MilestoneStatus.Pending) revert InvalidMilestoneState();

        milestone.evidenceUrl = evidenceUrl;
        milestone.status = MilestoneStatus.Submitted;
        agreement.pendingCount -= 1;
        agreement.activeCount += 1;

        emit EvidenceSubmitted(agreementId, milestoneIndex, evidenceUrl);
    }

    function approveMilestone(uint256 agreementId, uint256 milestoneIndex) external {
        Agreement storage agreement = _getAgreement(agreementId);
        _requireActive(agreement);
        if (msg.sender != agreement.funder) revert NotFunder();

        Milestone storage milestone = _getMilestone(agreement, milestoneIndex);
        if (milestone.status != MilestoneStatus.Submitted) revert InvalidMilestoneState();

        milestone.status = MilestoneStatus.Approved;

        emit MilestoneApproved(agreementId, milestoneIndex);
    }

    function releaseMilestone(uint256 agreementId, uint256 milestoneIndex) external nonReentrant {
        Agreement storage agreement = _getAgreement(agreementId);
        _requireActive(agreement);
        if (msg.sender != agreement.funder) revert NotFunder();
        if (!agreement.isFunded) revert AgreementNotFunded();

        Milestone storage milestone = _getMilestone(agreement, milestoneIndex);
        if (milestone.fundsReleased) revert AlreadyReleased();
        if (milestone.status != MilestoneStatus.Approved) revert InvalidMilestoneState();

        uint256 amount = milestone.amount;

        milestone.fundsReleased = true;
        milestone.status = MilestoneStatus.Released;
        agreement.activeCount -= 1;
        agreementBalance[agreementId] -= amount;
        pendingWithdrawals[agreement.builder] += amount;

        emit MilestoneReleased(agreementId, milestoneIndex, amount, agreement.builder);

        _updateAgreementCompletion(agreementId, agreement);
    }

    function raiseDispute(uint256 agreementId, uint256 milestoneIndex) external {
        Agreement storage agreement = _getAgreement(agreementId);
        _requireActive(agreement);
        if (!agreement.isFunded) revert AgreementNotFunded();

        if (msg.sender != agreement.funder && msg.sender != agreement.builder) revert NotParticipant();

        Milestone storage milestone = _getMilestone(agreement, milestoneIndex);
        MilestoneStatus status = milestone.status;
        if (status != MilestoneStatus.Submitted && status != MilestoneStatus.Approved) revert InvalidMilestoneState();

        milestone.status = MilestoneStatus.Disputed;
        milestone.disputeDeadline = uint64(block.timestamp + 30 days);

        emit DisputeRaised(agreementId, milestoneIndex, msg.sender);
    }

    function resolveDispute(uint256 agreementId, uint256 milestoneIndex, bool favorFunder) external nonReentrant {
        Agreement storage agreement = _getAgreement(agreementId);
        _requireActive(agreement);
        if (msg.sender != agreement.arbitrator) revert NotArbitrator();
        if (!agreement.isFunded) revert AgreementNotFunded();

        Milestone storage milestone = _getMilestone(agreement, milestoneIndex);
        if (milestone.fundsReleased) revert AlreadyReleased();
        if (milestone.status != MilestoneStatus.Disputed) revert InvalidMilestoneState();

        uint256 amount = milestone.amount;
        address recipient;

        milestone.fundsReleased = true;
        agreement.activeCount -= 1;
        agreementBalance[agreementId] -= amount;

        if (favorFunder) {
            milestone.status = MilestoneStatus.Refunded;
            recipient = agreement.funder;
            emit MilestoneRefunded(agreementId, milestoneIndex, amount);
        } else {
            milestone.status = MilestoneStatus.Released;
            recipient = agreement.builder;
            emit MilestoneReleased(agreementId, milestoneIndex, amount, recipient);
        }

        pendingWithdrawals[recipient] += amount;

        emit DisputeResolved(agreementId, milestoneIndex, favorFunder);

        _updateAgreementCompletion(agreementId, agreement);
    }

    function escalateExpiredDispute(uint256 agreementId, uint256 milestoneIndex) external nonReentrant {
        Agreement storage agreement = _getAgreement(agreementId);
        _requireActive(agreement);
        if (!agreement.isFunded) revert AgreementNotFunded();

        Milestone storage milestone = _getMilestone(agreement, milestoneIndex);
        if (milestone.fundsReleased) revert AlreadyReleased();
        if (milestone.status != MilestoneStatus.Disputed) revert InvalidMilestoneState();
        if (block.timestamp <= milestone.disputeDeadline) revert InvalidMilestoneState();

        uint256 amount = milestone.amount;

        milestone.fundsReleased = true;
        milestone.status = MilestoneStatus.Refunded;
        agreement.activeCount -= 1;
        agreementBalance[agreementId] -= amount;
        pendingWithdrawals[agreement.funder] += amount;

        emit MilestoneRefunded(agreementId, milestoneIndex, amount);
        emit DisputeResolved(agreementId, milestoneIndex, true);

        _updateAgreementCompletion(agreementId, agreement);
    }

    function claimExpiredMilestone(uint256 agreementId, uint256 milestoneIndex) external nonReentrant {
        Agreement storage agreement = _getAgreement(agreementId);
        _requireActive(agreement);
        if (msg.sender != agreement.funder) revert NotFunder();
        if (!agreement.isFunded) revert AgreementNotFunded();

        Milestone storage milestone = _getMilestone(agreement, milestoneIndex);
        if (milestone.status != MilestoneStatus.Pending) revert MilestoneNotPending();
        if (milestone.deadline == 0 || block.timestamp <= milestone.deadline) revert DeadlineNotPassed();

        uint256 amount = milestone.amount;

        milestone.fundsReleased = true;
        milestone.status = MilestoneStatus.Refunded;
        agreement.pendingCount -= 1;
        agreementBalance[agreementId] -= amount;
        pendingWithdrawals[agreement.funder] += amount;

        emit MilestoneRefunded(agreementId, milestoneIndex, amount);

        _updateAgreementCompletion(agreementId, agreement);
    }

    function cancelAgreement(uint256 agreementId) external nonReentrant {
        Agreement storage agreement = _getAgreement(agreementId);
        _requireActive(agreement);
        if (msg.sender != agreement.funder) revert NotFunder();
        if (agreement.activeCount != 0) revert CancellationNotAllowed();

        uint256 length = agreement.milestones.length;
        uint256 totalRefund = 0;

        for (uint256 i = 0; i < length; i++) {
            Milestone storage milestone = agreement.milestones[i];

            if (milestone.status == MilestoneStatus.Pending) {
                milestone.status = MilestoneStatus.Refunded;
                milestone.fundsReleased = true;
                agreement.pendingCount -= 1;
                totalRefund += milestone.amount;

                emit MilestoneRefunded(agreementId, i, milestone.amount);
            }
        }

        agreement.status = AgreementStatus.Cancelled;

        if (agreement.isFunded && totalRefund > 0) {
            agreementBalance[agreementId] -= totalRefund;
            pendingWithdrawals[agreement.funder] += totalRefund;
        }

        emit AgreementCancelled(agreementId);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pendingWithdrawals[msg.sender] = 0;
        IERC20(allowedToken).safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    function getAgreement(uint256 agreementId) external view returns (Agreement memory agreementData) {
        Agreement storage agreement = _getAgreement(agreementId);

        agreementData.funder = agreement.funder;
        agreementData.builder = agreement.builder;
        agreementData.arbitrator = agreement.arbitrator;
        agreementData.token = agreement.token;
        agreementData.status = agreement.status;
        agreementData.totalAmount = agreement.totalAmount;
        agreementData.totalFunded = agreement.totalFunded;
        agreementData.pendingCount = agreement.pendingCount;
        agreementData.activeCount = agreement.activeCount;
        agreementData.isFunded = agreement.isFunded;

        uint256 length = agreement.milestones.length;
        agreementData.milestones = new Milestone[](length);
        for (uint256 i = 0; i < length; i++) {
            agreementData.milestones[i] = agreement.milestones[i];
        }
    }

    function getMilestone(uint256 agreementId, uint256 milestoneIndex) external view returns (Milestone memory) {
        Agreement storage agreement = _getAgreement(agreementId);
        Milestone storage milestone = _getMilestone(agreement, milestoneIndex);
        return milestone;
    }

    function getMilestoneCount(uint256 agreementId) external view returns (uint256) {
        Agreement storage agreement = _getAgreement(agreementId);
        return agreement.milestones.length;
    }

    function _getAgreement(uint256 agreementId) internal view returns (Agreement storage agreement) {
        if (agreementId >= agreementCount) revert InvalidAgreement();
        agreement = agreements[agreementId];
    }

    function _getMilestone(
        Agreement storage agreement,
        uint256 milestoneIndex
    ) internal view returns (Milestone storage milestone) {
        if (milestoneIndex >= agreement.milestones.length) revert InvalidMilestoneIndex();
        milestone = agreement.milestones[milestoneIndex];
    }

    function _requireActive(Agreement storage agreement) internal view {
        if (agreement.status != AgreementStatus.Active) revert AgreementNotActive();
    }

    function _updateAgreementCompletion(uint256 agreementId, Agreement storage agreement) internal {
        if (agreement.status != AgreementStatus.Active) return;
        if (agreement.pendingCount != 0 || agreement.activeCount != 0) return;

        agreement.status = AgreementStatus.Completed;

        if (agreementBalance[agreementId] != 0) {
            agreementBalance[agreementId] = 0;
        }
    }
}
