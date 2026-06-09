// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/ISettle.sol";
import "./interfaces/IAccord.sol";

/// @title SettleVault
/// @notice Autonomous yield vault gated by Somnia Accord onchain LLM.
///
///         Deposit flow:
///         1. deposit() — USDC escrowed, Accord inferString safety check fired
///         2. handleResponse() safety callback — if EXECUTE, fires Accord inferNumber pool check
///         3. handleResponse() pool callback — finalises deposit with confirmed poolId
contract SettleVault is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ── Constants ──────────────────────────────────────────────────────────
    uint256 public constant ACCORD_AGENT_ID   = 12847293847561029384;
    uint256 public constant SUBCOMMITTEE_SIZE = 3;
    uint256 public constant PER_AGENT_COST    = 70000000000000000; // 0.07 STT
    uint256 public constant MAX_DEPOSIT       = 1_000_000 * 1e6;
    uint256 public constant INTEREST_RATE_BPS = 1000;
    uint256 public constant SECONDS_PER_YEAR  = 365 days;

    // ── Structs ────────────────────────────────────────────────────────────

    struct UserPosition {
        uint256 balance;
        uint256 depositTime;
        uint256 accruedInterest;
        uint256 lastClaimTime;
        uint8   poolId;
        uint256 poolAPY;
        bool    active;
    }

    enum DepositStatus { NONE, SAFETY_PENDING, POOL_PENDING, FINALISED, REFUNDED }

    struct PendingDeposit {
        address wallet;
        uint256 amount;
        uint8   requestedPoolId;
        string  intentText;
        string  poolPrompt;
        bytes32 depositId;
        DepositStatus status;
    }

    // ── State ──────────────────────────────────────────────────────────────

    IERC20            public immutable token;
    IAPYFeed          public immutable apyFeed;
    IAttestationStore public immutable attestationStore;
    IAccordPlatform   public immutable accordPlatform;

    address public reactiveTrigger;
    bool    public paused;

    mapping(address => UserPosition)   public positions;
    mapping(address => uint256)        public userAPYThreshold;
    mapping(bytes32 => PendingDeposit) public pendingDeposits;
    mapping(uint256 => bytes32)        public requestToDepositId;
    mapping(uint256 => bool)           public isSafetyRequest;

    // ── Events ─────────────────────────────────────────────────────────────

    event DepositInitiated(
        bytes32 indexed depositId,
        address indexed wallet,
        uint256 amount,
        uint8   poolId
    );
    event AccordVerdictRequested(bytes32 indexed depositId, uint256 indexed requestId);
    event AccordPoolRequested(bytes32 indexed depositId, uint256 indexed requestId);
    event DepositFinalised(
        bytes32 indexed depositId,
        address indexed wallet,
        uint256 amount,
        uint8   poolId,
        uint256 apy
    );
    event DepositRefunded(
        bytes32 indexed depositId,
        address indexed wallet,
        uint256 amount,
        string  reason
    );
    event Rebalanced(address indexed wallet, uint8 fromPoolId, uint8 toPoolId, uint256 timestamp);
    event APYThresholdSet(address indexed wallet, uint256 threshold);

    // ── Debug events — remove post-hackathon ──────────────────────────────
    event AccordCallbackReceived(
        uint256 indexed requestId,
        bytes32 indexed depositId,
        bool    isSafety,
        uint8   status,
        uint256 responseCount
    );
    event AccordStringResult(uint256 indexed requestId, bytes32 indexed depositId, string result);
    event AccordNumberResult(uint256 indexed requestId, bytes32 indexed depositId, int256 result);
    event UnknownAccordRequest(uint256 indexed requestId, uint8 status, uint256 responseCount);

    // ── Errors ─────────────────────────────────────────────────────────────

    error Paused();
    error ZeroAmount();
    error ExceedsMaxDeposit();
    error InvalidPool(uint8 poolId);
    error InsufficientSTT();
    error OnlyAccordPlatform();
    error OnlyReactiveTrigger();
    error ZeroAddress();
    error NoPosition();
    error NotAnImprovement();
    error InsufficientBalance(uint256 requested, uint256 available);

    // ── Modifiers ──────────────────────────────────────────────────────────

    modifier whenNotPaused() { if (paused) revert Paused(); _; }
    modifier onlyAccordPlatform() {
        if (msg.sender != address(accordPlatform)) revert OnlyAccordPlatform();
        _;
    }
    modifier onlyReactiveTrigger() {
        if (msg.sender != reactiveTrigger) revert OnlyReactiveTrigger();
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────────

    constructor(
        address _token,
        address _apyFeed,
        address _attestationStore,
        address _accordPlatform
    ) Ownable(msg.sender) {
        if (_token            == address(0)) revert ZeroAddress();
        if (_apyFeed          == address(0)) revert ZeroAddress();
        if (_attestationStore == address(0)) revert ZeroAddress();
        if (_accordPlatform   == address(0)) revert ZeroAddress();
        token            = IERC20(_token);
        apyFeed          = IAPYFeed(_apyFeed);
        attestationStore = IAttestationStore(_attestationStore);
        accordPlatform   = IAccordPlatform(_accordPlatform);
    }

    // ── Setup ──────────────────────────────────────────────────────────────

    function setReactiveTrigger(address _trigger) external onlyOwner {
        if (_trigger == address(0)) revert ZeroAddress();
        reactiveTrigger = _trigger;
    }

    // ── Core: deposit ──────────────────────────────────────────────────────

    /// @param amount       USDC in base units (6 decimals)
    /// @param poolId       Pool index from APYFeed (0, 1, or 2)
    /// @param intentText   User intent — passed to Accord for context
    /// @param safetyPrompt Accord call 1 — safety check (built by Sage)
    /// @param poolPrompt   Accord call 2 — pool validation (built by Sage)
    /// @dev msg.value must cover 2x Accord fee — call getTotalDepositSTT() first
    function deposit(
        uint256 amount,
        uint8   poolId,
        string  calldata intentText,
        string  calldata safetyPrompt,
        string  calldata poolPrompt
    ) external payable nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (amount > MAX_DEPOSIT) revert ExceedsMaxDeposit();

        IAPYFeed.Pool memory pool = apyFeed.getPool(poolId);
        if (!pool.active) revert InvalidPool(poolId);

        uint256 accordFee = getAccordDeposit();
        if (msg.value < accordFee * 2) revert InsufficientSTT();

        token.safeTransferFrom(msg.sender, address(this), amount);

        bytes32 depositId = keccak256(abi.encodePacked(
            msg.sender, amount, poolId, intentText, block.timestamp
        ));

        pendingDeposits[depositId] = PendingDeposit({
            wallet:          msg.sender,
            amount:          amount,
            requestedPoolId: poolId,
            intentText:      intentText,
            poolPrompt:      poolPrompt,
            depositId:       depositId,
            status:          DepositStatus.SAFETY_PENDING
        });

        emit DepositInitiated(depositId, msg.sender, amount, poolId);

        // Accord call 1 — inferString safety check
        string[] memory verdicts = new string[](2);
        verdicts[0] = "EXECUTE";
        verdicts[1] = "BLOCKED";

        bytes memory payload = abi.encodeWithSelector(
            IAccordAgent.inferString.selector,
            safetyPrompt,
            "You are a DeFi safety agent on Somnia. Verify the deposit is safe. Return only EXECUTE or BLOCKED.",
            true,
            verdicts
        );

        uint256 requestId = accordPlatform.createRequest{value: accordFee}(
            ACCORD_AGENT_ID,
            address(this),
            this.handleResponse.selector,
            payload
        );

        requestToDepositId[requestId] = depositId;
        isSafetyRequest[requestId]    = true;

        emit AccordVerdictRequested(depositId, requestId);
    }

    // ── Accord callback ────────────────────────────────────────────────────
    // Handles both safety (call 1) and pool (call 2) callbacks
    // selector = this.handleResponse.selector — registered with platform

    function handleResponse(
        uint256 requestId,
        IAccord.Response[] memory responses,
        IAccord.ResponseStatus status,
        IAccord.Request memory /* details */
    ) external onlyAccordPlatform {
        bytes32 depositId = requestToDepositId[requestId];
        bool    isSafety  = isSafetyRequest[requestId];

        // Debug — emit raw callback info immediately
        emit AccordCallbackReceived(requestId, depositId, isSafety, uint8(status), responses.length);

        // Guard against unknown requests
        if (depositId == bytes32(0)) {
            emit UnknownAccordRequest(requestId, uint8(status), responses.length);
            return;
        }

        delete requestToDepositId[requestId];
        delete isSafetyRequest[requestId];

        PendingDeposit storage dep = pendingDeposits[depositId];

        // ── Safety callback (call 1) ───────────────────────────────────────
        if (isSafety) {
            if (dep.status != DepositStatus.SAFETY_PENDING) return;

            // Accord failed to respond
            if (status != IAccord.ResponseStatus.Success || responses.length == 0) {
                _refund(dep, "Accord safety check failed");
                return;
            }

            string memory verdict = abi.decode(responses[0].result, (string));
            emit AccordStringResult(requestId, depositId, verdict);

            if (_equals(verdict, "BLOCKED")) {
                _refund(dep, "Accord: deposit blocked");
                return;
            }

            // Safety passed — fire Accord call 2: inferNumber pool validation
            dep.status = DepositStatus.POOL_PENDING;

            uint256 poolCount = apyFeed.poolCount();

            // inferNumber returns poolId directly — no string matching needed
            bytes memory payload = abi.encodeWithSelector(
                IAccordAgent.inferNumber.selector,
                dep.poolPrompt,
                "You are a yield optimization agent on Somnia. Return only a pool index number.",
                int256(0),
                int256(poolCount - 1),
                true
            );

            uint256 accordFee     = getAccordDeposit();
            uint256 poolRequestId = accordPlatform.createRequest{value: accordFee}(
                ACCORD_AGENT_ID,
                address(this),
                this.handleResponse.selector,
                payload
            );

            requestToDepositId[poolRequestId] = depositId;
            isSafetyRequest[poolRequestId]    = false;

            emit AccordPoolRequested(depositId, poolRequestId);
            return;
        }

        // ── Pool callback (call 2) ─────────────────────────────────────────
        if (dep.status != DepositStatus.POOL_PENDING) return;

        uint8 confirmedPoolId = dep.requestedPoolId; // fallback to Sage's choice

        if (status == IAccord.ResponseStatus.Success && responses.length > 0) {
            int256 returnedPoolId = abi.decode(responses[0].result, (int256));
            emit AccordNumberResult(requestId, depositId, returnedPoolId);

            // Validate returned poolId is in range
            if (returnedPoolId >= 0 && uint256(returnedPoolId) < apyFeed.poolCount()) {
                IAPYFeed.Pool memory p = apyFeed.getPool(uint8(uint256(returnedPoolId)));
                if (p.active) confirmedPoolId = uint8(uint256(returnedPoolId));
            }
        }

        _finalise(dep, confirmedPoolId);
    }

    // ── Core: rebalance ────────────────────────────────────────────────────

    function rebalance(address wallet, uint8 newPoolId) external onlyReactiveTrigger {
        UserPosition storage pos = positions[wallet];
        if (!pos.active || pos.balance == 0) return;

        IAPYFeed.Pool memory newPool = apyFeed.getPool(newPoolId);
        if (!newPool.active) revert InvalidPool(newPoolId);
        if (newPool.apy <= pos.poolAPY) revert NotAnImprovement();

        uint8   oldPoolId = pos.poolId;
        uint256 oldAPY    = pos.poolAPY;
        pos.poolId  = newPoolId;
        pos.poolAPY = newPool.apy;

        try attestationStore.logRebalance(
            wallet, oldPoolId, newPoolId, oldAPY, newPool.apy, block.timestamp
        ) {} catch {}

        emit Rebalanced(wallet, oldPoolId, newPoolId, block.timestamp);
    }

    // ── Core: withdraw ─────────────────────────────────────────────────────

    function withdraw(uint256 amount) external nonReentrant whenNotPaused {
        UserPosition storage pos = positions[msg.sender];
        if (!pos.active) revert NoPosition();

        uint256 interest       = _calcInterest(pos.balance, pos.lastClaimTime);
        uint256 totalAvailable = pos.balance + pos.accruedInterest + interest;
        if (amount > totalAvailable) revert InsufficientBalance(amount, totalAvailable);

        uint256 totalInterest = pos.accruedInterest + interest;
        if (amount <= totalInterest) {
            pos.accruedInterest = totalInterest - amount;
        } else {
            pos.balance        -= (amount - totalInterest);
            pos.accruedInterest = 0;
        }

        pos.lastClaimTime = block.timestamp;
        if (pos.balance == 0) pos.active = false;
        token.safeTransfer(msg.sender, amount);
    }

    // ── Settings ───────────────────────────────────────────────────────────

    function setAPYThreshold(uint256 bps) external {
        userAPYThreshold[msg.sender] = bps;
        emit APYThresholdSet(msg.sender, bps);
    }

    // ── View ───────────────────────────────────────────────────────────────

    function getPosition(address wallet) external view returns (UserPosition memory) {
        return positions[wallet];
    }

    function getPendingDeposit(bytes32 depositId) external view returns (PendingDeposit memory) {
        return pendingDeposits[depositId];
    }

    function getAccordDeposit() public view returns (uint256) {
        return accordPlatform.getRequestDeposit() + (PER_AGENT_COST * SUBCOMMITTEE_SIZE);
    }

    function getTotalDepositSTT() external view returns (uint256) {
        return getAccordDeposit() * 2;
    }

    function getCallbackSelector() external pure returns (bytes4) {
        return this.handleResponse.selector;
    }

    // ── Owner ──────────────────────────────────────────────────────────────

    function pause()   external onlyOwner { paused = true; }
    function unpause() external onlyOwner { paused = false; }
    receive() external payable {}

    // ── Internal ───────────────────────────────────────────────────────────

    function _finalise(PendingDeposit storage dep, uint8 confirmedPoolId) internal {
        IAPYFeed.Pool memory pool = apyFeed.getPool(confirmedPoolId);
        UserPosition storage pos  = positions[dep.wallet];

        if (pos.active) {
            pos.accruedInterest += _calcInterest(pos.balance, pos.lastClaimTime);
        }

        pos.balance      += dep.amount;
        pos.depositTime   = block.timestamp;
        pos.lastClaimTime = block.timestamp;
        pos.poolId        = confirmedPoolId;
        pos.poolAPY       = pool.apy;
        pos.active        = true;
        dep.status        = DepositStatus.FINALISED;

        try attestationStore.logReceipt(
            dep.wallet, dep.amount, confirmedPoolId, pool.name, dep.intentText, block.timestamp
        ) {} catch {}

        emit DepositFinalised(dep.depositId, dep.wallet, dep.amount, confirmedPoolId, pool.apy);
    }

    function _refund(PendingDeposit storage dep, string memory reason) internal {
        dep.status = DepositStatus.REFUNDED;
        token.safeTransfer(dep.wallet, dep.amount);
        emit DepositRefunded(dep.depositId, dep.wallet, dep.amount, reason);
    }

    function _calcInterest(uint256 balance, uint256 from) internal view returns (uint256) {
        if (balance == 0) return 0;
        return (balance * INTEREST_RATE_BPS * (block.timestamp - from))
            / (10000 * SECONDS_PER_YEAR);
    }

    function _equals(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
