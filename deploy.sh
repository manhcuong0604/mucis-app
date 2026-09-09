#!/usr/bin/env bash
# ==========================================================
# Mucis Player - 24/7 Automated Production Deployment Script
# ==========================================================

set -e

echo "🚀 [1/5] Kiểm tra môi trường Docker trên VPS..."
if ! command -v docker &> /dev/null; then
  echo "❌ Lỗi: Docker chưa được cài đặt trên VPS. Vui lòng cài Docker trước."
  exit 1
fi

# Hỗ trợ cả lệnh 'docker compose' (V2) và 'docker-compose' (V1)
if docker compose version &> /dev/null; then
  DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
  DOCKER_COMPOSE="docker-compose"
else
  echo "❌ Lỗi: Docker Compose chưa được cài đặt."
  exit 1
fi

echo "📥 [2/5] Đang kiểm tra và cập nhật mã nguồn mới nhất từ Git..."
if [ -d ".git" ]; then
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
  echo "   Đang kéo code từ nhánh: $CURRENT_BRANCH"
  git pull origin "$CURRENT_BRANCH" || git pull origin main || true
else
  echo "   (Bỏ qua git pull vì không phát hiện kho lưu trữ git)"
fi

echo "📁 [3/5] Chuẩn bị thư mục lưu trữ database SQLite (Data Volume)..."
mkdir -p ./data
chmod 755 ./data

# Tự động di chuyển database cũ vào thư mục ./data nếu chưa có
if [ -f "music_player.db" ] && [ ! -f "./data/music_player.db" ]; then
  echo "   Phát hiện database cũ ở thư mục gốc, đang chuyển vào ./data/music_player.db..."
  cp music_player.db ./data/music_player.db
fi

echo "🔨 [4/5] Rebuild image và khởi chạy container với downtime tối thiểu..."
$DOCKER_COMPOSE up -d --build

echo "🧹 Dọn dẹp các Docker image không còn sử dụng..."
docker image prune -f || true

echo "⏳ [5/5] Kiểm tra trạng thái sức khỏe container (Healthcheck)..."
sleep 4

for i in {1..12}; do
  STATUS=$(docker inspect --format='{{json .State.Health.Status}}' mucis-app 2>/dev/null || echo '"unknown"')
  if [[ "$STATUS" == "\"healthy\"" ]]; then
    echo "✅ Ứng dụng đã khởi động thành công và đạt trạng thái HEALTHY!"
    break
  fi
  echo "   Đang chờ container sẵn sàng ($i/12, status: $STATUS)..."
  sleep 3
done

echo ""
echo "=========================================================="
echo "🎉 Triển khai ứng dụng Mucis hoàn tất!"
echo "🌐 Truy cập trực tiếp tại: http://$(curl -s ifconfig.me || echo 'IP_CỦA_VPS')"
echo "📊 Xem logs container:    $DOCKER_COMPOSE logs -f"
echo "=========================================================="
