#!/usr/bin/env bash
# Extract non-code resources of the original J2ME JAR into public/original/
set -euo pipefail
JAR="${1:-$HOME/Downloads/Real-Tournament_J2ME_EN_v110/Real Tournament (2012)(RMG)(v1.1.0).jar}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/original"
mkdir -p "$OUT"
unzip -oq "$JAR" -x '*.class' 'META-INF/*' -d "$OUT"
echo "extracted to $OUT"
