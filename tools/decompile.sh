#!/usr/bin/env bash
# Decompile original classes with CFR into tools/out/ (gitignored)
set -euo pipefail
cd "$(dirname "$0")"
JAVA="$(ls -d "$PWD"/jdk/*/Contents/Home)/bin/java"
D="$HOME/Downloads/Real-Tournament_J2ME_EN_v110"
rm -rf out && mkdir -p out/base out/a10
"$JAVA" -jar cfr.jar "$D/Real Tournament (2012)(RMG)(v1.1.0).jar" --outputdir out/base >/dev/null 2>&1
"$JAVA" -jar cfr.jar "$D/Real Tournament (2012)(RMG)(v1.1.0)(a10).jar" --outputdir out/a10 >/dev/null 2>&1
wc -l out/base/*.java out/a10/*.java
