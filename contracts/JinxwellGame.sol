// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ICasinoGameV2, SessionContext, StepResult, SessionPhase} from "../vendor/casino-sdk/simulator/contracts/ICasinoGameV2.sol";

/// @notice One precommitted route/depth, one random word, one settlement. No timing input.
contract JinxwellGame is ICasinoGameV2 {
    uint256 public constant MIN_WAGER = 1;
    uint256 public constant MAX_WAGER = 1e24;
    struct Outcome {
        uint8 version; uint8 route; uint8 depth; uint8 tier; uint16 ticket;
        uint32 multiplierBps; bool cut; bool shield;
        uint16 slashMask; uint16 openedMask; uint8 collectedMask;
    }
    error InvalidConfig(); error InvalidWager(); error InvalidTicket();
    error InvalidSession(); error NoPlayerAction();

    function _config(uint8 route, uint8 depth) internal pure {
        if (route > 2 || depth < 1 || depth > 3) revert InvalidConfig();
    }
    function _decode(bytes calldata data) internal pure returns (uint8 route, uint8 depth) {
        if (data.length != 64) revert InvalidConfig();
        (route, depth) = abi.decode(data, (uint8, uint8));
        _config(route, depth);
        if (keccak256(data) != keccak256(abi.encode(route, depth))) revert InvalidConfig();
    }
    function _wager(uint256 wager) internal pure {
        if (wager < MIN_WAGER || wager > MAX_WAGER) revert InvalidWager();
    }
    function paytable(uint8 route, uint8 depth) public pure returns (uint256[6] memory weights, uint32[6] memory mults) {
        _config(route, depth);
        uint256[3] memory half = [uint256(4000), 2600, 1000];
        uint256[3] memory even = [uint256(2500), 2000, 1500];
        uint256[3] memory doubleWin = [uint256(1000), 1000, 800];
        weights[1] = half[route]; weights[2] = even[route]; weights[3] = doubleWin[route];
        weights[5] = (uint256(route) + 1) * 100;
        weights[4] = (9600 - weights[1] / 2 - weights[2] - 2 * weights[3] - (3 + 3 * uint256(depth)) * weights[5]) / 4;
        weights[0] = 10000 - weights[1] - weights[2] - weights[3] - weights[4] - weights[5];
        mults = [uint32(0), 5000, 10000, 20000, 40000, uint32((3 + 3 * uint256(depth)) * 10000)];
    }
    function payoutFor(uint256 wager, uint32 mult) public pure returns (uint256) {
        _wager(wager); if (mult > 120000) revert InvalidConfig();
        return wager * mult / 10000;
    }
    function resolveTicket(uint8 route, uint8 depth, uint16 ticket) public pure returns (Outcome memory o) {
        (uint256[6] memory weights, uint32[6] memory mults) = paytable(route, depth);
        if (ticket >= 10000) revert InvalidTicket();
        uint8 band; uint256 end = weights[0];
        while (ticket >= end) { ++band; end += weights[band]; }
        o.version = 1; o.route = route; o.depth = depth; o.tier = depth; o.ticket = ticket;
        o.cut = band == 0 || band == 2 || band == 5;
        o.shield = band == 2 || band == 4 || band == 5;
        uint8 opened = band == 0 ? 31 : uint8((uint256(1) << band) - 1);
        o.openedMask = uint16(opened) << (5 * (depth - 1)); o.slashMask = o.openedMask;
        o.collectedMask = o.cut && !o.shield ? 0 : opened;
        uint8 count;
        for (uint8 i; i < 5; ++i) if ((o.collectedMask & (uint8(1) << i)) != 0) ++count;
        o.multiplierBps = mults[count];
    }
    function drawTicket(bytes32 seed) public pure returns (uint16) {
        // 2^256 mod 10000 = (MAX mod 10000 + 1) mod 10000.
        uint256 remainder = (type(uint256).max % 10000 + 1) % 10000;
        uint256 maxAccepted = type(uint256).max - remainder;
        uint256 word = uint256(seed); uint256 counter;
        while (word > maxAccepted) { word = uint256(keccak256(abi.encode(seed, ++counter))); }
        return uint16(word % 10000);
    }
    function quoteCaps(uint256 wager, bytes calldata data) public pure override returns (uint256, uint256) {
        (uint8 route, uint8 depth) = _decode(data);
        (, uint32[6] memory mults) = paytable(route, depth);
        return (wager, payoutFor(wager, mults[5]) - wager);
    }
    function quoteRiskParams(uint256 wager, bytes calldata data) external pure override returns (uint256, uint256, uint256, uint256) {
        (uint8 route, uint8 depth) = _decode(data);
        (uint256[6] memory weights, uint32[6] memory mults) = paytable(route, depth);
        return _risk(wager, weights, mults);
    }
    function _risk(uint256 wager, uint256[6] memory weights, uint32[6] memory mults) internal pure returns (uint256, uint256, uint256, uint256) {
        uint256 sum; uint256 bodySum; uint256 bodySquares;
        for (uint256 i; i < 6; ++i) {
            uint256 p = payoutFor(wager, mults[i]); sum += weights[i] * p;
            if (i != 5) { bodySum += weights[i] * p; bodySquares += weights[i] * p * p; }
        }
        return (payoutFor(wager, mults[5]), weights[5] * 1e14, sum / 10000, bodySquares * 1e14 - bodySum * bodySum * 1e10);
    }
    function onSessionStart(SessionContext calldata ctx) external pure override returns (StepResult memory result) {
        (, uint256 reserve) = quoteCaps(ctx.wagerBase, ctx.gameData);
        if (ctx.gameState.length != 0 || ctx.escrowedStake != ctx.wagerBase || ctx.reservedProfit != 0) revert InvalidSession();
        result.newGameState = hex"";
        result.reservedProfitDelta = int256(reserve);
        result.nextPhase = SessionPhase.WAITING_RANDOMNESS; result.requestRandomnessNow = true;
    }
    function onRandomness(SessionContext calldata ctx, bytes32 randomness) external pure override returns (StepResult memory result) {
        (uint8 route, uint8 depth) = _decode(ctx.gameData);
        (, uint256 reserve) = quoteCaps(ctx.wagerBase, ctx.gameData);
        if (ctx.gameState.length != 0 || ctx.escrowedStake != ctx.wagerBase || ctx.reservedProfit != reserve) revert InvalidSession();
        Outcome memory o = resolveTicket(route, depth, drawTicket(randomness));
        result.newGameState = abi.encode(o);
        result.nextPhase = SessionPhase.SETTLED;
        result.payout = payoutFor(ctx.wagerBase, o.multiplierBps);
        // Host releases reserve after applying the payout cap. Both deltas stay zero.
    }
    function onPlayerAction(SessionContext calldata, bytes calldata) external pure override returns (StepResult memory) { revert NoPlayerAction(); }
    function quoteForfeitPayout(SessionContext calldata) external pure override returns (uint256) { return 0; }
}
