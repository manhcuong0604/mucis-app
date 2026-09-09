# ==========================================================
# Production Dockerfile for Mucis (Linux Native Rebuild)
# ==========================================================
FROM node:20-bookworm-slim

WORKDIR /app

# 1. Cài đặt Python 3, build tools C++ (make, g++, build-essential cho better-sqlite3), FFmpeg, curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    make \
    g++ \
    build-essential \
    ffmpeg \
    curl \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# 2. Cài đặt Python dependencies (ytmusicapi, yt-dlp)
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r backend/requirements.txt

# 3. Cài đặt Node dependencies và rebuild better-sqlite3 trực tiếp cho môi trường Linux
COPY package*.json ./
RUN npm install
RUN npm rebuild better-sqlite3

# 4. Copy giao diện frontend đã pre-build sẵn từ local
COPY dist ./dist

# 5. Copy mã nguồn server và backend
COPY backend ./backend
COPY server ./server
COPY vite-dev-backend.ts ./

# 6. Build dist-server trực tiếp trên môi trường Linux để tránh lỗi xung đột binary
RUN npm run build:server

# 7. Thiết lập thư mục lưu trữ dữ liệu bền vững (SQLite Volume)
RUN mkdir -p /app/data

# Biến môi trường mặc định (tương thích Render PORT 10000)
ENV NODE_ENV=production
ENV PORT=10000
ENV HOST=0.0.0.0
ENV DB_PATH=/app/data/music_player.db
ENV PYTHON_BIN=python3

# Mở cổng theo Render
EXPOSE 10000

# Kiểm tra tình trạng sức khỏe ứng dụng
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT:-10000}/api/health || exit 1

# Khởi chạy server production
CMD ["node", "dist-server/index.js"]
