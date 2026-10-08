// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IPonsTypes, IPonsLaunchAndBuy, IPonsFactory, IPonsFeeEscrow, IPonsCurve} from "./interfaces/IPons.sol";
import {FeeverageFeeSink} from "./FeeverageFeeSink.sol";

/// @title FeeverageLauncher
/// @notice Launches tokens on Pons V2 (Robinhood Chain) through the PonsV2LaunchAndBuy
/// router. Every token's creator fees are routed to its own FeeverageFeeSink, and the
/// keeper turns them into a leveraged Hyperliquid position with the strategy the
/// creator picked at launch (market, direction, leverage).
contract FeeverageLauncher is IPonsTypes, Ownable2Step, ReentrancyGuard, Pausable {
    struct Strategy {
        string market; // Hyperliquid perp symbol, e.g. "BTC", "ETH", "HYPE"
        bool isLong;
        uint8 leverage; // 1..maxLeverage
    }

    struct LaunchInput {
        string name;
        string symbol;
        string logo;
        string description;
        Socials socials;
        uint16 creatorTaxBps; // optional extra tax on trades, capped by Pons
        bytes32 salt; // CREATE2 salt for the Pons pair (vanity / uniqueness)
    }

    struct Launch {
        address token;
        address curve;
        address sink;
        address creator;
        address hlAccount; // Hyperliquid account that holds this token's position
        uint64 createdAt;
        bool isLong;
        uint8 leverage;
        string market;
    }

    IPonsLaunchAndBuy public immutable router;
    IPonsFactory public immutable factory;
    IPonsFeeEscrow public immutable feeEscrow;
    address public immutable sinkImplementation;

    address public operator;
    uint256 public launchConfigId;
    uint8 public maxLeverage = 20;

    Launch[] private _launches;
    mapping(address token => uint256 indexPlusOne) private _indexOf;
    mapping(bytes32 market => bool) public allowedMarket;
    mapping(address creator => uint256) public creatorNonce;

    event Launched(
        uint256 indexed index,
        address indexed token,
        address indexed creator,
        address curve,
        address sink,
        string market,
        bool isLong,
        uint8 leverage
    );
    event HlAccountSet(uint256 indexed index, address indexed token, address hlAccount);
    event OperatorSet(address operator);
    event MarketAllowed(string market, bool allowed);
    event MaxLeverageSet(uint8 maxLeverage);
    event LaunchConfigIdSet(uint256 id);

    error BadLeverage();
    error MarketNotAllowed();
    error NotOperator();
    error UnknownToken();
    error ZeroAddress();
    error RefundFailed();

    constructor(
        address owner_,
        address operator_,
        IPonsLaunchAndBuy router_,
        IPonsFactory factory_,
        IPonsFeeEscrow feeEscrow_,
        string[] memory markets
    ) Ownable(owner_) {
        if (operator_ == address(0) || address(router_) == address(0)) revert ZeroAddress();
        if (address(factory_) == address(0) || address(feeEscrow_) == address(0)) revert ZeroAddress();
        operator = operator_;
        router = router_;
        factory = factory_;
        feeEscrow = feeEscrow_;
        sinkImplementation = address(new FeeverageFeeSink());
        for (uint256 i = 0; i < markets.length; ++i) {
            allowedMarket[keccak256(bytes(markets[i]))] = true;
            emit MarketAllowed(markets[i], true);
        }
    }

    // ------------------------------------------------------------------ launch

    /// @notice ETH to send with `launch`: the Pons launch fee plus the opening buy.
    function quoteLaunchValue(uint256 quoteIn) external view returns (uint256) {
        return factory.launchFee() + quoteIn;
    }

    /// @notice Address the next launch from `creator` will use as its fee sink.
    function predictSink(address creator) public view returns (address) {
        return Clones.predictDeterministicAddress(sinkImplementation, _sinkSalt(creator, creatorNonce[creator]));
    }

    /// @notice Launch a token on Pons and make its fees fund a Hyperliquid position.
    /// @param quoteIn ETH (wei) for the creator's opening buy; may be 0.
    /// @param minTokensOut slippage guard for that opening buy.
    function launch(LaunchInput calldata input, Strategy calldata strategy, uint256 quoteIn, uint256 minTokensOut)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (address token, address curve, uint256 tokensOut)
    {
        if (strategy.leverage == 0 || strategy.leverage > maxLeverage) revert BadLeverage();
        if (!allowedMarket[keccak256(bytes(strategy.market))]) revert MarketNotAllowed();

        address sink = Clones.cloneDeterministic(sinkImplementation, _sinkSalt(msg.sender, creatorNonce[msg.sender]++));
        FeeverageFeeSink(payable(sink)).initialize(address(this));

        TokenParams memory params = TokenParams({
            name: input.name,
            symbol: input.symbol,
            logo: input.logo,
            description: input.description,
            socials: input.socials,
            creatorFeeRecipient: sink,
            creatorTaxBps: input.creatorTaxBps,
            buybackEnabled: false, // every fee goes to the position, none to buyback
            expectedEconomics: bytes32(0),
            salt: input.salt
        });

        address[] memory exemptions = new address[](1);
        exemptions[0] = msg.sender; // creator's opening buy skips the snipe tax

        uint256 balanceBefore = address(this).balance - msg.value;
        (token, curve, tokensOut) = router.launchAndBuy{value: msg.value}(
            params, launchConfigId, address(0), quoteIn, minTokensOut, msg.sender, exemptions
        );
        FeeverageFeeSink(payable(sink)).bindToken(token);

        _launches.push(
            Launch({
                token: token,
                curve: curve,
                sink: sink,
                creator: msg.sender,
                hlAccount: address(0),
                createdAt: uint64(block.timestamp),
                isLong: strategy.isLong,
                leverage: strategy.leverage,
                market: strategy.market
            })
        );
        uint256 index = _launches.length - 1;
        _indexOf[token] = index + 1;
        emit Launched(index, token, msg.sender, curve, sink, strategy.market, strategy.isLong, strategy.leverage);

        // Refund anything the router sent back (e.g. unused opening-buy ETH).
        uint256 refund = address(this).balance - balanceBefore;
        if (refund > 0) {
            (bool ok,) = payable(msg.sender).call{value: refund}("");
            if (!ok) revert RefundFailed();
        }
    }

    // -------------------------------------------------------------- fee flow

    /// @notice Moves pending curve fees into the Pons escrow. Pons only lets the
    /// launch's deployer (this contract) or its sweep operator do this, so the
    /// launcher exposes it to everyone. Only valid before graduation; after
    /// graduation the Uniswap V4 hook credits the escrow on its own.
    function sweepCurveFees(address token) public {
        Launch storage l = _get(token);
        if (!IPonsCurve(l.curve).graduated()) {
            IPonsCurve(l.curve).sweepFees(0);
        }
    }

    /// @notice Curve fees → escrow → sink → operator, in one call.
    function collect(address token) external returns (uint256 amount) {
        Launch storage l = _get(token);
        if (!IPonsCurve(l.curve).graduated()) {
            try IPonsCurve(l.curve).sweepFees(0) {} catch {}
        }
        amount = FeeverageFeeSink(payable(l.sink)).sweep();
    }

    /// @notice ETH fees claimable right now for `token` (already in escrow or sink).
    function pendingFees(address token) external view returns (uint256) {
        Launch storage l = _get(token);
        return feeEscrow.balanceOf(l.sink) + l.sink.balance;
    }

    // ----------------------------------------------------------------- views

    function launchCount() external view returns (uint256) {
        return _launches.length;
    }

    function getLaunch(uint256 index) external view returns (Launch memory) {
        return _launches[index];
    }

    function getLaunchByToken(address token) external view returns (Launch memory) {
        return _get(token);
    }

    /// @notice Paged listing, newest first.
    function getLaunches(uint256 offset, uint256 limit) external view returns (Launch[] memory page) {
        uint256 n = _launches.length;
        if (offset >= n) return new Launch[](0);
        uint256 count = n - offset < limit ? n - offset : limit;
        page = new Launch[](count);
        for (uint256 i = 0; i < count; ++i) {
            page[i] = _launches[n - 1 - offset - i];
        }
    }

    function canLaunchNow() external view returns (bool) {
        return !paused() && factory.canLaunch(address(this));
    }

    // ----------------------------------------------------------------- admin

    /// @notice The keeper records which Hyperliquid account holds each token's position.
    function setHlAccount(address token, address hlAccount) external {
        if (msg.sender != operator) revert NotOperator();
        Launch storage l = _get(token);
        l.hlAccount = hlAccount;
        emit HlAccountSet(_indexOf[token] - 1, token, hlAccount);
    }

    function setOperator(address operator_) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
        emit OperatorSet(operator_);
    }

    function setMarket(string calldata market, bool allowed) external onlyOwner {
        allowedMarket[keccak256(bytes(market))] = allowed;
        emit MarketAllowed(market, allowed);
    }

    function setMaxLeverage(uint8 maxLeverage_) external onlyOwner {
        if (maxLeverage_ == 0 || maxLeverage_ > 50) revert BadLeverage();
        maxLeverage = maxLeverage_;
        emit MaxLeverageSet(maxLeverage_);
    }

    function setLaunchConfigId(uint256 id) external onlyOwner {
        launchConfigId = id;
        emit LaunchConfigIdSet(id);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // -------------------------------------------------------------- internal

    function _get(address token) private view returns (Launch storage) {
        uint256 i = _indexOf[token];
        if (i == 0) revert UnknownToken();
        return _launches[i - 1];
    }

    function _sinkSalt(address creator, uint256 nonce) private pure returns (bytes32) {
        return keccak256(abi.encode(creator, nonce));
    }

    /// @dev Receives router refunds during `launch`.
    receive() external payable {}
}
