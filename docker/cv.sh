#!/usr/bin/env bash
# Run any cv command in the claude-video image, e.g.  docker/cv.sh build my-video
# Mounts this checkout's projects/ (specs you edit) and public/ (cached voice clips), the
# output dir, and a model cache volume, so the container behaves like a native install.
# Env: CV_IMAGE (default claude-video), CV_OUT_DIR (default ~/gh/reports/video).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${CV_IMAGE:-claude-video}"
OUT="${CV_OUT_DIR:-$HOME/gh/reports/video}"
mkdir -p "$OUT" "$REPO/projects" "$REPO/public"
tty=()
[ -t 0 ] && [ -t 1 ] && tty=(-it)
exec docker run --rm ${tty[@]+"${tty[@]}"} \
  -v "$REPO/projects:/app/projects" \
  -v "$REPO/public:/app/public" \
  -v "$OUT:/out" \
  -v claude-video-models:/cache \
  "$IMAGE" "$@"
