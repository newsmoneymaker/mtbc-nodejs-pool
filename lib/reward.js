/**
 * Block reward of MTBC mainnet: a fixed step schedule (NOT a simple halving), read verbatim from src/validation.cpp GetBlockSubsidy() of
 * mateable/mateablecoin-24.x (branch 24.x). Height 1 alone carries a 100,000,000 MTBC premine (the pool never mines height 1). No dev/
 * community fee -- the whole subsidy plus fees is the pool's coinbase output (see lib/blockBuilder.js). Amounts in atomic units (1 MTBC = 1e8).
 * Beyond the last defined band (height > 8,599,999) the reward is a perpetual tail emission of 1 MTBC.
 **/
const MTBC_BASE = 100000000;

const BANDS = [
	[1, 1, 100000000],          // premine, block 1 only
	[2, 199999, 214],
	[200000, 399999, 107],
	[400000, 599999, 53.50],
	[600000, 799999, 26.75],
	[800000, 999999, 13.375],
	[1000000, 1999999, 6.6875],
	[2000000, 3999999, 3.34375],
	[4000000, 4599999, 1],
	[4600000, 5599999, 3],
	[5600000, 6599999, 6],
	[6600000, 7599999, 3],
	[7600000, 8599999, 1]
];
const TAIL_EMISSION = 1;        // heights beyond the schedule above (> 8,599,999)

exports.minerReward = function (height) {
	if (!(height >= 1)) return 0;
	for (let [lo, hi, coins] of BANDS) {
		if (height >= lo && height <= hi) return Math.round(coins * MTBC_BASE);
	}
	return Math.round(TAIL_EMISSION * MTBC_BASE);
};
