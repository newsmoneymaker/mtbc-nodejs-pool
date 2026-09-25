# Installing a MateableCoin pool

Paths below match the reference deployment on mtbc.pool-pay.com: the pool in `/root/claude/mtbc-nodejs-pool`, the node and its data in
`/root/claude/mtbc` (the systemd templates in `deployment/systemd/` use these paths; adjust for `/opt/...` + a dedicated user if you
prefer that layout, which is what `config_examples/mtbc.json` assumes).

## 1. MateableCoin node and wallet

MateableCoin Core (`https://github.com/mateable/mateablecoin-24.x`, branch `24.x`, MIT) is a Bitcoin Core 24.x based, multi-algorithm
node ("adapted from Bitcoin Core"; scrypt/yescrypt/whirlpool/ghostrider/balloon PoW, plus a separate Particl-PoSv3-based PoS system
this pool does not use). Its CI builds on Ubuntu 22.04; on a host with an old glibc/GCC (Debian 10 has GCC 8) build from source in a
newer userland, for example a Debian 12 chroot made with `debootstrap`. **No source patch was needed with GCC 12.** The source uses
its own `depends` system.

```
git clone -b 24.x https://github.com/mateable/mateablecoin-24.x && cd mateablecoin-24.x
# build dependencies: curl build-essential libtool autotools-dev automake pkg-config python3 bsdmainutils patch bison xz-utils unzip p7zip-full
make -C depends NO_QT=1 NO_UPNP=1 NO_NATPMP=1 NO_ZMQ=1 NO_USDT=1 -j5
./autogen.sh
./configure --prefix=$PWD/depends/x86_64-pc-linux-gnu --without-gui --disable-tests --disable-bench --disable-man
make -j5                                                    # src/mateabled, src/mateable-cli
```

`/root/claude/mtbc/data/mtbc.conf`:

```
server=1
listen=1
daemon=0
txindex=1
rpcuser=mtbcpool
rpcpassword=<a long random password>
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
rpcport=6966
port=6969
maxconnections=60
dbcache=1024
```

**Use the project's chain snapshot.** Validating 4.6M+ multi-algo blocks from genesis is slow. The project publishes a bootstrap at
`https://coin.mateable.com/download/coin/mateable-bootstrap-20260513.zip` (a `blocks/` directory only, no `chainstate/`): unpack it
into the data directory and start the node once with `-reindex` to rebuild the chainstate from the blocks. **Gotcha:** this fork sets
`static const bool DEFAULT_TXINDEX = true;` in `src/validation.h` (upstream Bitcoin Core defaults this to `false`) -- so `-reindex`
silently also builds a full transaction index unless you put `txindex=0` in the conf explicitly, and `-reindex-chainstate` (the
lighter, UTXO-only rebuild) will always refuse with "not compatible with -txindex" once *any* prior run has persisted
`fTxIndex=true` into the block index database, even after you remove `txindex=1` from the conf again -- the only fix at that point is
to delete `blocks/index/` and `chainstate/` (not the raw `blk*.dat`/`rev*.dat`, those are reusable) and reindex fully from scratch
with `txindex=0` set from the very first run. With `txindex=0` set correctly, a full `-reindex` connects the (mostly tiny,
coinbase-only) blocks at well over 1000/s once its one-time block-file indexing pass finishes, so bootstrap + reindex is a matter of
minutes to tens of minutes, not hours. The node then catches up the remaining weeks of blocks over P2P by itself
(`mateable-cli getblockchaininfo`). Block templates are served once `initialblockdownload` is false.

**No default wallet.** This fork, like modern Bitcoin Core, no longer auto-creates a wallet. Also, `dumpwallet`/`importwallet` (the
legacy dump format) only work on legacy (BDB) wallets, and this build has no BDB support (only sqlite/descriptor wallets) -- so back
up a descriptor wallet with `backupwallet <file>` (the sqlite file) *and* `listdescriptors true` (the human-readable equivalent of a
dump, includes the private descriptors). Create the wallet once with `createwallet "" false false "" false true` (empty name, so it
stays reachable at the RPC root path `/` the same way `mtbcRpc.js` calls it, no `options.wallet` needed) and put `wallet=` (blank) in
`mtbc.conf` so it auto-loads on every future start.

MateableCoin's `getblocktemplate` needs **both** the segwit rule **and an explicit algorithm**, since the coin is multi-algorithm:

```
mateable-cli getblocktemplate '{"rules":["segwit"]}' yescrypt
```

The node ORs the matching version bits (`nVersion |= GetVersionForAlgo(algo)`, `src/multialgo.cpp`) into the returned template and the
result carries `pow_algo`/`pow_algo_id`; consensus then validates whichever algorithm the submitted block actually used. This pool
(`lib/pool.js`) always passes `"yescrypt"`.

The default wallet of the node is the pool wallet:

```
mateable-cli getnewaddress "pool"                              # M... : the pool address (poolServer.poolAddress)
mateable-cli dumpwallet /safe/place/mtbc-wallet-dump.txt        # the private keys: keep it offline, chmod 600 (also: mateable-cli backupwallet <file>)
```

Back it up again whenever the wallet hands out new addresses.

**No consensus dev fee.** Unlike some other coins this pool family has been built for, MTBC's `BlockAssembler::CreateNewBlock`
(`src/node/miner.cpp`) gives the coinbase a **single output**: `nFees + GetBlockSubsidy(height)`. Nothing is deducted before it
reaches the pool/miners.

## 2. yescrypt helper

The helper (`hasher/yphash`) is a tiny C program that calls `yescrypt_hash()` from the node's own yescrypt sources, bundled verbatim
in `hasher/crypto/yescrypt/` (copied from `src/crypto/yescrypt/` of the node repo, BSD license, so the hash is guaranteed to match
consensus): `cd hasher && make` (needs only a C compiler with SSE4.1; `STATIC=-static` for a binary that runs anywhere). Check it:
`node test/test-real-blocks.js` (fetches recent yescrypt-algo blocks from explorer.mateable.com live and re-hashes them). A hash
takes a few milliseconds; `hasher.threads` helper processes work in parallel (each share is one hash).

## 3. Redis

Use a dedicated instance with a password and AOF (`deployment/redis-pool.conf.example`, unit `mtbc-pool-redis`, port 6388).

## 4. The pool

```
cd mtbc-nodejs-pool && npm install --production
cp config_examples/mtbc.json config.json      # then edit it
```

Edit `config.json`: `poolHost`, `poolServer.poolAddress` (the wallet address of step 1), the ports and the certificate for TLS
(`poolServer.sslCert/sslKey`), `redis`, `api.password`, `node.password` or `node.passwordFile`, `blockUnlocker.poolFee` and
`donations`, `payments`. **Keep `payments.dryRun: true` until the rehearsal below.**

```
cp deployment/systemd/*.service /etc/systemd/system/ && systemctl daemon-reload
systemctl enable --now mtbc-pool-redis mtbc-node
systemctl enable --now mtbc-pool mtbc-pool-api mtbc-pool-unlocker mtbc-pool-payments mtbc-pool-charts
node test/test-mtbc-proposal.js config.json        # the node itself validates a block built by the pool (needs the synchronised node)
```

The pool runs as separate modules (`init.js -module=pool|api|unlocker|payments|chartsDataCollector`), each in its own unit.
Point a miner at it: `poolpayminer -a yescryptr8 -o your.pool:4000 -u <an M... address> -p x`.

## 5. Website

Copy `website_example/` to the web root, set `poolHost`, the contact and links in `config.js`, and proxy `/api` to the pool API on
127.0.0.1:8126 (`deployment/apache-vhost.conf.example` exposes only the read-only methods).

## 6. Rehearse the payments

1. `payments.dryRun: true`: the log of `mtbc-pool-payments` shows what would be paid.
2. Fund the pool wallet with a few coins (or wait for the first block), credit a small balance in Redis to your own test addresses
   (`<coin>:workers:<address>`, field `balance`), set `payments.onlyAccounts` to them, `dryRun: false`, and watch the payout confirm.
3. Remove the test accounts from Redis and set `onlyAccounts` to `[]`.

Good to know: block rewards can be spent after **60 blocks** (the node's own `nCoinbaseMaturity = 59`, roughly an hour);
`deployment/pause-payments.sh` stops new payouts at once; the wallet must stay unlocked and online for the payouts (leave the pool
wallet unencrypted with only small balances in it). Of a yescrypt block the pool gets the whole subsidy plus fees -- MTBC's consensus
does not take any cut of its own.
