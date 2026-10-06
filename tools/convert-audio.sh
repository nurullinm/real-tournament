#!/usr/bin/env bash
# Decode the original AMR sound effects/music (from the (a10) JAR) to WAV for WebAudio.
# MIDI files in the base JAR need a synth/SoundFont; the AMR recordings are the original effects, complete, and iOS-safe once decoded.
set -euo pipefail
JAR="${1:-$HOME/Downloads/Real-Tournament_J2ME_EN_v110/Real Tournament (2012)(RMG)(v1.1.0)(a10).jar}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
OUT="$ROOT/public/audio"
mkdir -p "$OUT"
unzip -oq "$JAR" '*.amr' -d "$TMP"
for f in "$TMP"/*.amr; do
  ffmpeg -loglevel error -y -i "$f" -ac 1 -ar 16000 "$OUT/$(basename "${f%.amr}").wav"
done
rm -rf "$TMP"
ls -l "$OUT"
