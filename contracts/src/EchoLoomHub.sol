// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Immutable native-MON social curation hub. Not audited; deploy only to a test network.
contract EchoLoomHub {
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_TEXT = 280;
    uint256 public constant MIN_STAKE_WINDOW = 1 hours;
    uint256 public constant MAX_STAKE_WINDOW = 30 days;

    address public owner;
    uint16 public protocolTipFeeBps = 200;
    bool public paused;
    uint256 public loomCount;
    uint256 public postCount;
    uint256 public protocolFees;
    uint256 private entered = 1;

    struct Loom {
        address curator;
        string name;
        string description;
        string category;
        uint16 creatorBps;
        uint16 curatorBps;
        uint16 supporterBps;
        uint64 stakeWindow;
        bool active;
    }
    struct Post {
        address creator;
        uint256 loomId;
        string contentURI;
        bytes32 contentHash;
        uint64 createdAt;
        uint64 deadline;
        uint16 creatorBps;
        uint16 curatorBps;
        uint16 supporterBps;
        uint256 totalStake;
        uint256 rewardPool;
        bool active;
        bool creatorClaimed;
        bool curatorClaimed;
    }

    mapping(uint256 => Loom) public looms;
    mapping(uint256 => Post) public posts;
    mapping(uint256 => mapping(address => uint256)) public stakeOf;
    /// @dev Preserves historical stake weight after principal is withdrawn at settlement.
    mapping(uint256 => mapping(address => uint256)) public stakeWeight;
    mapping(uint256 => mapping(address => bool)) public supporterClaimed;
    mapping(address => uint256) public pendingWithdrawals;

    event LoomCreated(uint256 indexed loomId, address indexed curator, string name);
    event LoomUpdated(uint256 indexed loomId);
    event LoomDeactivated(uint256 indexed loomId);
    event PostCreated(uint256 indexed postId, uint256 indexed loomId, address indexed creator, string contentURI, bytes32 contentHash);
    event AttentionStaked(uint256 indexed postId, address indexed supporter, uint256 amount);
    event StakeWithdrawn(uint256 indexed postId, address indexed supporter, uint256 amount);
    event TipDispatched(address indexed sender, address indexed creator, uint256 amount, uint256 fee);
    event RewardFunded(uint256 indexed postId, address indexed funder, uint256 amount);
    event RewardClaimed(uint256 indexed postId, address indexed account, uint256 amount, uint8 allocation);
    event CreatorWithdrawal(address indexed account, uint256 amount);
    event CuratorWithdrawal(address indexed account, uint256 amount);
    event ProtocolFeeWithdrawn(address indexed account, uint256 amount);
    event ConfigurationUpdated(uint16 tipFeeBps);
    event PauseUpdated(bool paused);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized(); error Paused(); error InvalidInput(); error NotFound();
    error TooEarly(); error NothingToWithdraw(); error ReentrantCall();

    modifier onlyOwner() { if (msg.sender != owner) revert Unauthorized(); _; }
    modifier live() { if (paused) revert Paused(); _; }
    modifier nonReentrant() { if (entered != 1) revert ReentrantCall(); entered = 2; _; entered = 1; }

    constructor() { owner = msg.sender; }

    function createLoom(string calldata name, string calldata description, string calldata category,
        uint16 creatorBps, uint16 curatorBps, uint16 supporterBps, uint64 stakeWindow) external live returns (uint256 id) {
        if (bytes(name).length == 0 || bytes(name).length > MAX_TEXT || bytes(description).length > MAX_TEXT ||
            bytes(category).length == 0 || bytes(category).length > 48 || uint256(creatorBps) + curatorBps + supporterBps > BPS ||
            stakeWindow < MIN_STAKE_WINDOW || stakeWindow > MAX_STAKE_WINDOW) revert InvalidInput();
        id = ++loomCount;
        looms[id] = Loom(msg.sender, name, description, category, creatorBps, curatorBps, supporterBps, stakeWindow, true);
        emit LoomCreated(id, msg.sender, name);
    }

    function updateLoom(uint256 id, string calldata name, string calldata description, string calldata category,
        uint16 creatorBps, uint16 curatorBps, uint16 supporterBps, uint64 stakeWindow) external live {
        Loom storage l = looms[id];
        if (l.curator == address(0)) revert NotFound();
        if (msg.sender != l.curator) revert Unauthorized();
        if (bytes(name).length == 0 || bytes(name).length > MAX_TEXT || bytes(description).length > MAX_TEXT ||
            bytes(category).length == 0 || bytes(category).length > 48 || uint256(creatorBps) + curatorBps + supporterBps > BPS ||
            stakeWindow < MIN_STAKE_WINDOW || stakeWindow > MAX_STAKE_WINDOW) revert InvalidInput();
        l.name = name; l.description = description; l.category = category;
        l.creatorBps = creatorBps; l.curatorBps = curatorBps; l.supporterBps = supporterBps; l.stakeWindow = stakeWindow;
        emit LoomUpdated(id);
    }

    function deactivateLoom(uint256 id) external {
        Loom storage l = looms[id]; if (l.curator == address(0)) revert NotFound();
        if (msg.sender != l.curator && msg.sender != owner) revert Unauthorized();
        l.active = false; emit LoomDeactivated(id);
    }

    function createPost(uint256 loomId, string calldata contentURI, bytes32 contentHash) external live returns (uint256 id) {
        Loom storage l = looms[loomId];
        if (!l.active || bytes(contentURI).length == 0 || bytes(contentURI).length > 512) revert InvalidInput();
        if (block.timestamp > type(uint64).max - l.stakeWindow) revert InvalidInput();
        id = ++postCount;
        uint64 deadline = uint64(block.timestamp) + l.stakeWindow;
        posts[id] = Post(msg.sender, loomId, contentURI, contentHash, uint64(block.timestamp), deadline,
            l.creatorBps, l.curatorBps, l.supporterBps, 0, 0, true, false, false);
        emit PostCreated(id, loomId, msg.sender, contentURI, contentHash);
    }

    function stake(uint256 postId) external payable live {
        Post storage p = posts[postId];
        if (!p.active || p.creator == address(0) || block.timestamp >= p.deadline || msg.value == 0) revert InvalidInput();
        stakeOf[postId][msg.sender] += msg.value; stakeWeight[postId][msg.sender] += msg.value; p.totalStake += msg.value;
        emit AttentionStaked(postId, msg.sender, msg.value);
    }

    function withdrawStake(uint256 postId) external nonReentrant {
        Post storage p = posts[postId]; if (p.creator == address(0)) revert NotFound();
        if (block.timestamp < p.deadline) revert TooEarly();
        uint256 amount = stakeOf[postId][msg.sender]; if (amount == 0) revert NothingToWithdraw();
        stakeOf[postId][msg.sender] = 0;
        emit StakeWithdrawn(postId, msg.sender, amount);
        _pay(payable(msg.sender), amount);
    }

    function fundReward(uint256 postId) external payable live {
        Post storage p = posts[postId]; if (p.creator == address(0) || block.timestamp >= p.deadline || msg.value == 0) revert InvalidInput();
        p.rewardPool += msg.value; emit RewardFunded(postId, msg.sender, msg.value);
    }

    /// allocation: 0 supporter share; 1 creator share; 2 curator share
    function claimReward(uint256 postId, uint8 allocation) external nonReentrant {
        Post storage p = posts[postId]; if (p.creator == address(0)) revert NotFound();
        if (block.timestamp < p.deadline) revert TooEarly();
        uint256 amount = 0;
        if (allocation == 0) amount = _claimSupporter(postId, p);
        else if (allocation == 1) amount = _claimCreator(p);
        else if (allocation == 2) amount = _claimCurator(p);
        else revert InvalidInput();
        if (amount == 0) revert NothingToWithdraw();
        emit RewardClaimed(postId, msg.sender, amount, allocation); _pay(payable(msg.sender), amount);
    }

    function _claimSupporter(uint256 postId, Post storage p) private returns (uint256 amount) {
        if (supporterClaimed[postId][msg.sender]) revert NothingToWithdraw();
        supporterClaimed[postId][msg.sender] = true;
        if (p.totalStake != 0) amount = p.rewardPool * p.supporterBps / BPS * stakeWeight[postId][msg.sender] / p.totalStake;
    }

    function _claimCreator(Post storage p) private returns (uint256 amount) {
        if (msg.sender != p.creator) revert Unauthorized();
        if (p.creatorClaimed) revert NothingToWithdraw();
        p.creatorClaimed = true;
        amount = p.rewardPool * p.creatorBps / BPS;
        emit CreatorWithdrawal(msg.sender, amount);
    }

    function _claimCurator(Post storage p) private returns (uint256 amount) {
        if (msg.sender != looms[p.loomId].curator) revert Unauthorized();
        if (p.curatorClaimed) revert NothingToWithdraw();
        p.curatorClaimed = true;
        amount = p.rewardPool * p.curatorBps / BPS;
        emit CuratorWithdrawal(msg.sender, amount);
    }

    function tip(address payable creator) external payable nonReentrant live {
        if (creator == address(0) || creator == msg.sender || msg.value == 0) revert InvalidInput();
        uint256 fee = msg.value * protocolTipFeeBps / BPS; uint256 net = msg.value - fee;
        protocolFees += fee; pendingWithdrawals[creator] += net;
        emit TipDispatched(msg.sender, creator, net, fee);
    }

    function withdrawEarnings() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender]; if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;
        emit CreatorWithdrawal(msg.sender, amount); _pay(payable(msg.sender), amount);
    }
    function withdrawProtocolFees(address payable recipient) external nonReentrant onlyOwner {
        if (recipient == address(0)) revert InvalidInput(); uint256 amount = protocolFees;
        if (amount == 0) revert NothingToWithdraw(); protocolFees = 0;
        emit ProtocolFeeWithdrawn(recipient, amount); _pay(recipient, amount);
    }
    function setTipFee(uint16 feeBps) external onlyOwner {
        if (feeBps > 500) revert InvalidInput(); protocolTipFeeBps = feeBps; emit ConfigurationUpdated(feeBps);
    }
    function setPaused(bool value) external onlyOwner { paused = value; emit PauseUpdated(value); }
    function getLoomCore(uint256 id) external view returns (address curator, bool active, uint16 creatorBps, uint16 curatorBps, uint16 supporterBps) {
        Loom storage l = looms[id]; return (l.curator, l.active, l.creatorBps, l.curatorBps, l.supporterBps);
    }
    function getPostCore(uint256 id) external view returns (address creator, uint256 loomId, uint64 deadline, uint256 totalStake, uint256 rewardPool) {
        Post storage p = posts[id]; return (p.creator, p.loomId, p.deadline, p.totalStake, p.rewardPool);
    }
    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert InvalidInput(); address previous = owner; owner = next;
        emit OwnershipTransferred(previous, next);
    }
    function _pay(address payable recipient, uint256 amount) private {
        (bool ok,) = recipient.call{value: amount}(""); if (!ok) revert InvalidInput();
    }
}
