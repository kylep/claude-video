#!/usr/bin/env bash
# Install the in-repo tutorial-video skill as a real copy in ~/.claude/skills.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO/skill/tutorial-video"
DEST="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/tutorial-video"

[ -f "$SRC/SKILL.md" ] || { echo "missing $SRC/SKILL.md" >&2; exit 1; }
# Replace an old symlink install rather than writing through it into the repo.
[ -L "$DEST" ] && rm "$DEST"
mkdir -p "$DEST"
rsync -a --delete "$SRC/" "$DEST/"
echo "deployed $SRC -> $DEST ($(git -C "$REPO" rev-parse --short HEAD)$(git -C "$REPO" diff --quiet -- skill || echo ', uncommitted changes'))"
