# yphash: MateableCoin's own yescrypt sources (src/crypto/yescrypt/ of mateable/mateablecoin-24.x, copied verbatim into crypto/yescrypt/
# here so the #include <crypto/yescrypt/...> paths used by the node's own source resolve unchanged), BSD licence, see the file headers.
# yescrypt-best.c #includes yescrypt-simd.c on x86_64 (SSE2/SSE4.1/AVX2 optimized), which in turn #includes yescrypt-platform.c -- so
# only sha256_Y.c, yescrypt.c and yescrypt-best.c are compiled as separate translation units, exactly as MTBC's own src/Makefile.am does.
#   make            (STATIC=-static makes a binary that runs on any Linux)
CC ?= gcc
STATIC ?=
yphash: yphash.c crypto/yescrypt/yescrypt.c crypto/yescrypt/yescrypt-best.c crypto/yescrypt/sha256_Y.c
	$(CC) -O2 -fomit-frame-pointer -msse4.1 $(STATIC) -o $@ yphash.c crypto/yescrypt/yescrypt.c crypto/yescrypt/yescrypt-best.c crypto/yescrypt/sha256_Y.c -I.
clean:
	rm -f yphash
