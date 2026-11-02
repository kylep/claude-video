# claude-video on Linux (amd64 or arm64): same narrators and pipeline as the native macOS
# install, with the voice models on the CPU through PyTorch instead of the GPU through MLX.
# Build from the repo root:  docker build -f docker/Dockerfile -t claude-video .
# See README "Docker" for the run command and volumes.
FROM node:22-bookworm-slim

# Chrome Headless Shell libraries for Remotion (remotion.dev/docs/docker), ImageMagick for
# contact sheets, curl for asset downloads, espeak-ng (Kokoro fallback phonemizer), sox and
# libsndfile (audio I/O for the voice models).
RUN apt-get update && apt-get install -y --no-install-recommends \
      libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev \
      libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
      imagemagick curl ca-certificates espeak-ng sox libsndfile1 \
    && apt-get clean && rm -r /var/lib/apt/lists

COPY --from=ghcr.io/astral-sh/uv:0.11.3 /uv /usr/local/bin/uv
ENV UV_PYTHON_INSTALL_DIR=/opt/python \
    UV_LINK_MODE=copy

WORKDIR /app

# Dependencies first, so code edits don't reinstall them.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund && npx remotion browser ensure
COPY requirements-torch.txt ./
RUN uv venv -q --python 3.12 .venv \
    && uv pip install -q --python .venv/bin/python --torch-backend cpu -r requirements-torch.txt

COPY . .
# Re-checks everything above (each step no-ops when current). Models download on first use
# into HF_HOME, which should be a volume so they survive container restarts.
RUN node bin/cv.mjs setup --skip-models

ENV CV_OUT_DIR=/out \
    HF_HOME=/cache/huggingface
ENTRYPOINT ["node", "bin/cv.mjs"]
CMD ["doctor"]
