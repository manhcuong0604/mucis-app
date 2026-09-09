# ==========================================================
# Multi-stage Dockerfile for Mucis Music Player (24/7 Cloud/VPS)
# ==========================================================

# ----------------------------------------------------------
# Stage 1: Build Frontend (Vite/React) & Server Bundle (Node.js)
# ----------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Cài đặt công cụ biên dịch phụ trợ trên môi trường Alpine
RUN apk add --no-cache python3 make g++

# Cài đặt dependencies để build
COPY package*.json ./
RUN npm ci

# Copy mã nguồn và build toàn bộ frontend (dist/) & server bundle (dist-server/)
COPY . .
RUN npm run build

# ----------------------------------------------------------
# Stage 2: Production Runtime (Node.js 20 + Python 3 + FFmpeg)
# ----------------------------------------------------------
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# 1. Cài đặt Python 3, pip, ffmpeg, curl và build-essential (hỗ trợ better-sqlite3 glibc)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    curl \
    ca-certificates \
    build-essential \
 && rm -rf /var/lib/apt/lists/*

# 2. Cài đặt Python dependencies (ytmusicapi, yt-dlp)
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r backend/requirements.txt

# 3. Cài đặt production dependencies cho Node.js (better-sqlite3, bcryptjs, jsonwebtoken, etc.)
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 4. Copy các bản build từ builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server

# 5. Copy mã nguồn Python backend microservice & server
COPY backend ./backend
COPY server ./server
COPY vite-dev-backend.ts ./

# 6. Thiết lập thư mục lưu trữ dữ liệu bền vững (SQLite Volume)
RUN mkdir -p /app/data

# Biến môi trường mặc định
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DB_PATH=/app/data/music_player.db
ENV PYTHON_BIN=python3

# Mở cổng 3000
EXPOSE 3000

# Kiểm tra tình trạng sức khỏe ứng dụng
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Khởi chạy server production
CMD ["node", "dist-server/index.js"]
