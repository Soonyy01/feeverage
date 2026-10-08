// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {FeeverageLauncher} from "../src/FeeverageLauncher.sol";
import {FeeverageFeeSink} from "../src/FeeverageFeeSink.sol";
import {IPonsTypes, IPonsLaunchAndBuy, IPonsFactory, IPonsFeeEscrow} from "../src/interfaces/IPons.sol";

contract MockEscrow is IPonsFeeEscrow {
    mapping(address => uint256) public override balanceOf;

    function credit(address r) external payable {
        balanceOf[r] += msg.value;
    }

    function claim() external returns (uint256 a) {
        a = balanceOf[msg.sender];
        balanceOf[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: a}("");
        require(ok);
    }

    function claimToken(address) external pure returns (uint256) {
        return 0;
    }

    function balanceOfToken(address, address) external pure returns (uint256) {
        return 0;
    }
}

contract MockToken is ERC20 {
    constructor(string memory n, string memory s, address to, uint256 amt) ERC20(n, s) {
        _mint(to, amt);
    }
}

contract MockCurve {
    address public deployer;
    address public sink;
    MockEscrow public escrow;
    bool public graduated;

    constructor(address d, address s, MockEscrow e) {
        deployer = d;
        sink = s;
        escrow = e;
    }

    function sweepFees(uint256) external {
        require(msg.sender == deployer, "NotFeeSweepOperator");
        escrow.credit{value: address(this).balance}(sink);
    }

    receive() external payable {}
}

contract MockFactory is IPonsFactory {
    uint256 public launchFee = 0.001 ether;
    bool public open = true;

    function canLaunch(address) external view returns (bool) {
        return open;
    }

    function transferCreatorFeeRecipient(address, address) external {}
}

contract MockRouter is IPonsLaunchAndBuy {
    MockFactory public factory;
    MockEscrow public escrow;
    uint256 public refundWei;
    TokenParams public lastParams;
    address public lastRecipient;
    address public lastExemption;

    constructor(MockFactory f, MockEscrow e) {
        factory = f;
        escrow = e;
    }

    function setRefund(uint256 r) external {
        refundWei = r;
    }

    function launchAndBuy(
        TokenParams calldata params,
        uint256,
        address pairToken,
        uint256 quoteIn,
        uint256,
        address recipient,
        address[] calldata ex
    ) external payable returns (address token, address curve, uint256 tokensOut) {
        require(pairToken == address(0), "pair");
        require(msg.value == factory.launchFee() + quoteIn, "value");
        require(factory.canLaunch(msg.sender), "NotWhitelisted");
        lastParams = params;
        lastRecipient = recipient;
        lastExemption = ex[0];
        tokensOut = quoteIn * 1000;
        token = address(new MockToken(params.name, params.symbol, recipient, tokensOut));
        curve = address(new MockCurve(msg.sender, params.creatorFeeRecipient, escrow));
        if (refundWei > 0) {
            (bool ok,) = msg.sender.call{value: refundWei}("");
            require(ok);
        }
    }

    receive() external payable {}
}

contract FeeverageLauncherTest is Test {
    MockEscrow escrow;
    MockFactory factory;
    MockRouter router;
    FeeverageLauncher launcher;

    address owner = makeAddr("owner");
    address operator = makeAddr("operator");
    address alice = makeAddr("alice");

    function setUp() public {
        escrow = new MockEscrow();
        factory = new MockFactory();
        router = new MockRouter(factory, escrow);
        string[] memory m = new string[](3);
        m[0] = "BTC";
        m[1] = "ETH";
        m[2] = "HYPE";
        launcher = new FeeverageLauncher(
            owner, operator, IPonsLaunchAndBuy(address(router)), factory, IPonsFeeEscrow(address(escrow)), m
        );
        vm.deal(alice, 10 ether);
    }

    function _input() internal pure returns (FeeverageLauncher.LaunchInput memory i) {
        i.name = "Lever Cat";
        i.symbol = "LCAT";
        i.logo = "https://example.com/l.png";
        i.description = "fees go long BTC";
        i.socials = IPonsTypes.Socials("", "", "", "", "");
        i.salt = bytes32(uint256(1));
    }

    function _strategy(string memory mkt, uint8 lev) internal pure returns (FeeverageLauncher.Strategy memory s) {
        s.market = mkt;
        s.isLong = true;
        s.leverage = lev;
    }

    function _launch(uint256 quoteIn) internal returns (address token, address curve) {
        uint256 v = launcher.quoteLaunchValue(quoteIn);
        vm.prank(alice);
        (token, curve,) = launcher.launch{value: v}(_input(), _strategy("BTC", 5), quoteIn, 0);
    }

    function test_launch_routesFeesToPredictedSink() public {
        address predicted = launcher.predictSink(alice);
        (address token,) = _launch(0.1 ether);

        FeeverageLauncher.Launch memory l = launcher.getLaunchByToken(token);
        assertEq(l.sink, predicted);
        assertEq(l.creator, alice);
        assertEq(l.leverage, 5);
        assertEq(l.market, "BTC");
        assertEq(FeeverageFeeSink(payable(l.sink)).token(), token);

        (,,,,, address feeRecipient,, bool buyback,,) = router.lastParams();
        assertEq(feeRecipient, l.sink);
        assertFalse(buyback);
        assertEq(router.lastRecipient(), alice);
        assertEq(router.lastExemption(), alice);
        assertEq(MockToken(token).balanceOf(alice), 0.1 ether * 1000);
        assertEq(launcher.launchCount(), 1);
        assertTrue(launcher.predictSink(alice) != predicted, "nonce advanced");
    }

    function test_launch_refundsRouterLeftovers() public {
        router.setRefund(0.03 ether);
        uint256 before = alice.balance;
        _launch(0.1 ether);
        assertEq(alice.balance, before - 0.101 ether + 0.03 ether);
        assertEq(address(launcher).balance, 0);
    }

    function test_launch_rejectsBadStrategy() public {
        uint256 v = launcher.quoteLaunchValue(0);
        vm.startPrank(alice);
        vm.expectRevert(FeeverageLauncher.BadLeverage.selector);
        launcher.launch{value: v}(_input(), _strategy("BTC", 0), 0, 0);
        vm.expectRevert(FeeverageLauncher.BadLeverage.selector);
        launcher.launch{value: v}(_input(), _strategy("BTC", 21), 0, 0);
        vm.expectRevert(FeeverageLauncher.MarketNotAllowed.selector);
        launcher.launch{value: v}(_input(), _strategy("DOGE", 3), 0, 0);
        vm.stopPrank();
    }

    function test_collect_movesCurveFeesToOperator() public {
        (address token, address curve) = _launch(0);
        vm.deal(curve, 0.5 ether); // simulated accrued trade fees

        assertEq(launcher.pendingFees(token), 0);
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        uint256 got = launcher.collect(token);

        assertEq(got, 0.5 ether);
        assertEq(operator.balance, 0.5 ether);
        assertEq(launcher.pendingFees(token), 0);
    }

    function test_sweep_isPermissionlessButOnlyPaysOperator() public {
        (address token,) = _launch(0);
        FeeverageLauncher.Launch memory l = launcher.getLaunchByToken(token);
        escrow.credit{value: 1 ether}(l.sink);
        assertEq(launcher.pendingFees(token), 1 ether);

        vm.prank(alice);
        FeeverageFeeSink(payable(l.sink)).sweep();
        assertEq(operator.balance, 1 ether);
        assertEq(alice.balance, 10 ether - 0.001 ether);
    }

    function test_sink_cannotBeReinitialized() public {
        (address token,) = _launch(0);
        FeeverageLauncher.Launch memory l = launcher.getLaunchByToken(token);
        vm.expectRevert(FeeverageFeeSink.AlreadyInitialized.selector);
        FeeverageFeeSink(payable(l.sink)).initialize(alice);
        vm.expectRevert(FeeverageFeeSink.NotLauncher.selector);
        FeeverageFeeSink(payable(l.sink)).bindToken(alice);
    }

    function test_migrate_onlyOwner() public {
        (address token,) = _launch(0);
        FeeverageLauncher.Launch memory l = launcher.getLaunchByToken(token);
        vm.prank(alice);
        vm.expectRevert(FeeverageFeeSink.NotLauncherOwner.selector);
        FeeverageFeeSink(payable(l.sink)).migrateFeeRecipient(address(factory), alice);
        vm.prank(owner);
        FeeverageFeeSink(payable(l.sink)).migrateFeeRecipient(address(factory), alice);
    }

    function test_setHlAccount_onlyOperator() public {
        (address token,) = _launch(0);
        vm.expectRevert(FeeverageLauncher.NotOperator.selector);
        launcher.setHlAccount(token, alice);
        vm.prank(operator);
        launcher.setHlAccount(token, address(0xBEEF));
        assertEq(launcher.getLaunchByToken(token).hlAccount, address(0xBEEF));
    }

    function test_pagination_newestFirst() public {
        _launch(0);
        (address t2,) = _launch(0);
        FeeverageLauncher.Launch[] memory page = launcher.getLaunches(0, 10);
        assertEq(page.length, 2);
        assertEq(page[0].token, t2);
        assertEq(launcher.getLaunches(5, 10).length, 0);
    }

    function test_paused_blocksLaunch() public {
        vm.prank(owner);
        launcher.pause();
        uint256 v = launcher.quoteLaunchValue(0);
        vm.prank(alice);
        vm.expectRevert();
        launcher.launch{value: v}(_input(), _strategy("BTC", 5), 0, 0);
        assertFalse(launcher.canLaunchNow());
    }
}
