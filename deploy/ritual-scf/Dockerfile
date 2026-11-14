FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv fonts-noto-cjk ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir Pillow==12.1.1
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY lib ./lib
COPY content ./content
COPY rules ./rules
COPY public/date-input.js ./public/date-input.js
COPY scripts ./scripts
COPY tools ./tools
COPY vendor ./vendor
RUN mkdir -p /tmp/ritual-worker && chown node:node /tmp/ritual-worker
ENV PRAYER_TEST_PYTHON=/opt/venv/bin/python3 \
 RITUAL_ENCODER_ROOT=/app/vendor/FrameFilm/prayer-service \
 RITUAL_FONT=/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc \
 RITUAL_STATE_DIR=/tmp/ritual-worker \
 RITUAL_PACKAGE_CACHE_DIR=/tmp/ritual-worker/packages \
 RITUAL_FRAME_CACHE_DIR=/tmp/ritual-worker/frames
USER node
RUN node scripts/check-ritual-server.mjs
ENV RITUAL_SCF_MODE=probe
CMD ["node","scripts/run-ritual-scf-job.mjs"]
