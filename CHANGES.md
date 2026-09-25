# Changes

## 1.0.0

* First release: MateableCoin (MTBC) pool derived from scash-nodejs-pool, veil-nodejs-pool, qwc-nodejs-pool, c64-nodejs-pool and
  ytn-nodejs-pool. MTBC is **multi-algorithm** (scrypt, yescrypt, whirlpool, ghostrider, balloon, chosen per block via version bits --
  `src/multialgo.cpp`); this pool always requests `getblocktemplate({"rules":["segwit"]}, "yescrypt")` and only ever builds/submits
  **yescrypt** blocks (branded `yescryptr8`: N=2048, r=8, p=1, self-salted). MTBC's separate hybrid PoS system (Particl PoSv3) is
  ignored entirely.
* The pool builds the blocks itself from `getblocktemplate` (`lib/blockBuilder.js`): a plain single-output coinbase (BIP34 height,
  extranonce, the pool's whole coinbasevalue, the witness commitment if present) -- unlike some other coins in this family, MTBC's
  consensus does not deduct any dev/community fee from the coinbase. The merkle branch and the 80 byte header follow; a solved block
  is sent with `submitblock`.
* `lib/pool.js` speaks Bitcoin Stratum v1 (prevhash with every 4 byte word reversed, version / ntime / nbits big endian, the nonce as
  the hex of the number, extranonce1 and extranonce2 of 4 bytes each). Job ids are per miner and carry the difficulty of that miner:
  the miner applies a new difficulty with its next job.
* `hasher/yphash` is a small C program that calls `yescrypt_hash()` from the node's own, unmodified `src/crypto/yescrypt/*` sources
  (bundled verbatim in `hasher/crypto/yescrypt/`, BSD license): `make -C hasher`, no other dependency. Verified bit-for-bit against
  the node's own `algo_sanity.cpp` test vector and against 6 real yescrypt-algo mainnet blocks fetched live from the explorer.
* `lib/reward.js` reads the real, non-halving step subsidy schedule of `GetBlockSubsidy()` (214 MTBC up to height 199,999, declining
  through several bands to a perpetual 1 MTBC tail emission after height 8,599,999).
* Payments and unlocker as in Bitcoin based pools (`sendmany`, `gettransaction`, coinbase maturity 59), base58 addresses (`M...`
  version byte 51, `t...` version byte 128).
* The variable difficulty of a worker is remembered across reconnects.
* Tests: address handling, the yescrypt hash of the node's own sanity-check vector and of real mainnet blocks, and a block built by
  the pool from a real node's template (algo `yescrypt`) validated by that node as a proposal.
* Not yet checked on a block found on mainnet: the payout with the real wallet (`sendmany` with `subtractfeefrom`). Payments stay
  `dryRun: true` until a first real block is found and the user allows it.
