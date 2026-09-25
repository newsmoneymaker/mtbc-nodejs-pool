# mtbc-nodejs-pool

Mining pool software for **MateableCoin (MTBC)** written in Node.js: a stratum server for MateableCoin's **yescrypt** algorithm (the
standard Bitcoin Stratum protocol), share checking, block building from the node's block template (a plain Bitcoin-style coinbase, a
single pool output plus the SegWit witness commitment when needed -- no dev/community fee is deducted), block accounting through the
pool wallet, and batch payouts. It is a fork of [cryptonote-nodejs-pool](https://github.com/dvandal/cryptonote-nodejs-pool) by Dvandal
(GNU GPL v2) and of its adaptations [scash-nodejs-pool](https://github.com/newsmoneymaker/scash-nodejs-pool),
[veil-nodejs-pool](https://github.com/newsmoneymaker/veil-nodejs-pool), [qwc-nodejs-pool](https://github.com/newsmoneymaker/qwc-nodejs-pool),
[c64-nodejs-pool](https://github.com/newsmoneymaker/c64-nodejs-pool) and [ytn-nodejs-pool](https://github.com/newsmoneymaker/ytn-nodejs-pool),
written for the Bitcoin Core 24.x based node and wallet RPC of [mateable/mateablecoin-24.x](https://github.com/mateable/mateablecoin-24.x).
Live example: <https://mtbc.pool-pay.com>.

## MateableCoin is multi-algorithm

Unlike the coins the earlier forks in this family were written for, **MTBC is not single-algorithm**. Every block's proof of work is one
of five algorithms -- scrypt, yescrypt, whirlpool, ghostrider, balloon (`src/multialgo.cpp` of the node) -- chosen per block and signalled
by version bits (`nVersion & (15 << 8)`). The node's `getblocktemplate` RPC takes the desired algorithm as an **explicit second parameter**
(`getblocktemplate({"rules":["segwit"]}, "yescrypt")`); it then returns a template whose version already carries the matching bits, and
`submitblock`/consensus validate whichever algorithm the submitted block actually used. **This pool always requests and builds `"yescrypt"`
blocks** and nothing else. MTBC also has a separate hybrid Proof-of-Stake system (Particl PoSv3, active since block 150,000) that this pool
ignores entirely -- it only ever builds and submits PoW blocks.

"yescrypt" here is what the wider mining ecosystem calls **yescryptr8**: `yescrypt_hash()` in the node's own
`src/crypto/yescrypt/yescrypt.c` calls `yescrypt_bsty(header, 80, header, 80, N=2048, r=8, p=1, ...)` -- self-salted (the 80-byte block
header is used as both password and salt). The pool's hasher (`hasher/yphash.c`) calls the node's own `yescrypt_hash()` on the bundled,
unmodified `src/crypto/yescrypt/*` sources of the node (see `hasher/crypto/yescrypt/`), so the hash is guaranteed to match consensus. It
was verified bit-for-bit both against the node's own built-in `algo_sanity.cpp` test vector and against real mainnet blocks fetched live
from explorer.mateable.com (see Tests below).

## What it does

* **Stratum server** (plain TCP and TLS ports, Bitcoin Stratum v1 in the form yescrypt miners such as
  [poolpayminer](https://github.com/newsmoneymaker/poolpayminer) use): the pool asks the node for a block template
  (`getblocktemplate`, algo `"yescrypt"`), **builds the block itself** (a coinbase with the BIP34 height, the extranonce, the pool's
  whole coinbasevalue as its single output, the SegWit witness commitment when the template has one; the merkle branch; the 80 byte
  header) and sends every miner `mining.notify` with a share difficulty that follows the miner's hashrate (vardiff, remembered across
  reconnects). It checks every share itself with a small C helper (`hasher/yphash`): the yescrypt hash of the header. A share that
  meets the network target is submitted to the node as a whole block with `submitblock`.
* **MateableCoin proof of work (yescrypt only):** yescryptr8 (N=2048, r=8, p=1, self-salted) over the 80 byte header; the hash as a
  little endian number must not be above the target. Yescrypt blocks target roughly 2.5 minutes apart (`nMultiAlgoTargetSpacing`).
  Block reward is a fixed, non-halving step schedule read from the node's own `GetBlockSubsidy()` (`lib/reward.js`): 214 MTBC up to
  height 199,999, then 107 / 53.5 / 26.75 / 13.375 / 6.6875 / 3.34375 / 1 / 3 / 6 / 3 / 1 MTBC across further bands up to height
  8,599,999, and a perpetual **1 MTBC tail emission** after that. No dev/community fee is deducted from the coinbase.
* **Accounts** are MateableCoin addresses (`M...` P2PKH, version byte 51, or `t...` P2SH, version byte 128; base58check verified),
  optionally `.worker` or `+worker`, with a reward mode prefix `prop:` (shared, default) or `solo:`.
* **Rewards:** PROP with time weighting (slush) or SOLO.
* **Block unlocker:** a block is settled after `depth` blocks (the node's own coinbase maturity is 59). The reward is what the pool
  wallet received in the block's coinbase transaction (`gettransaction`); a block that is no longer on the chain is marked orphaned
  and nothing is credited.
* **Payment processor:** everyone who is due is paid in **one `sendmany` transaction per round**. The balance is debited before
  sending; a batch whose outcome is unknown (crash, timeout) is found again in the wallet by its comment and never sent twice;
  refused or stuck batches go back to the balances. Dry-run mode, a whitelist for rehearsals and an emergency brake
  (`deployment/pause-payments.sh`).
* **Website and API:** a ready website (`website_example/`) with the dashboard and its graphs, blocks, payments, top miners, worker
  statistics, a "Getting started" page with a config generator, and the public read-only JSON API.
* **Protection against connection floods:** limits per IP, a login deadline, an optional IP allow list, banning of miners with many
  invalid shares.
* **Tests** (`test/`): address handling, the yescrypt helper against MTBC's own built-in `algo_sanity.cpp` test vector and against
  **real MateableCoin mainnet blocks** fetched live (`test-real-blocks.js`), and `test-mtbc-proposal.js`, which builds a block from
  the template of a **real, synchronised node** (algo `"yescrypt"`) and lets the node validate it as a block proposal (coinbase,
  merkle root, header: the node answers `null`), and refuses a block that pays one atom too much.

## Developer donation

The pool can take a **developer donation** from the reward of every block it finds, before the miners' shares are computed
(`blockUnlocker.donations`, a table `MateableCoin address -> percent`, up to 10% per entry; **empty by default in
`config_examples/mtbc.json`**). It is your pool and the license is the GPL: set what you want and tell your miners the truth about
the fees of your pool. This has nothing to do with the miner poolpayminer (a separate project with its own fee), and nothing to do
with MTBC's own consensus rules -- unlike some other coins in this family, MateableCoin's consensus itself does not deduct anything
from the coinbase.

## Installation

See [docs/INSTALL.md](docs/INSTALL.md): the MateableCoin node and wallet (build from source, or the project's release binaries and
bootstrap), the yescrypt helper, Redis, the pool services (systemd templates in `deployment/`), the website and the first payout
rehearsal.

Requirements: Linux, Node.js 18 or newer, Redis, a MateableCoin node (`mateabled`, mateable/mateablecoin-24.x) synchronised with the
network, a C compiler for the helper, a web server for the website and a TLS certificate for the TLS stratum ports.

## Miners

[poolpayminer](https://github.com/newsmoneymaker/poolpayminer) (Windows and Linux, free, has its own fee) knows it as `-a yescryptr8`.
Example: `poolpayminer -a yescryptr8 --tls -o mtbc.pool-pay.com:4001 -u MYourAddress+rigname -p x -k`.

## Tests

```
npm install
node test/test-account.js                     # address handling, needs nothing else
make -C hasher                                 # the yescrypt helper, needs only a C compiler
node test/test-real-blocks.js                  # the hash of real mainnet blocks, needs only the helper
node test/test-mtbc-proposal.js config.json    # needs a running synchronised mateabled (config.node) and poolServer.poolAddress from its wallet
```

## Money warning

The payment processor moves real coins. Rehearse first: `"dryRun": true`, then a whitelist (`onlyAccounts`) with a few small payouts
of your own, then enable it. A transaction that has been sent to the network can not be cancelled. Keep the wallet backup
(`dumpwallet` / `backupwallet`) and the RPC password private.

## License and credits

GNU GPL v2 (see LICENSE), like the original. Based on cryptonote-nodejs-pool by Dvandal and contributors. The block builder, the
Bitcoin Stratum server, the yescrypt helper and the MateableCoin adaptation are part of this project.
