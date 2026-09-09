# 📖 Hướng Dẫn Triển Khai Ứng Dụng Mucis Lên Cloud / VPS Linux (Từ Windows)

Tài liệu này hướng dẫn chi tiết từng bước đưa ứng dụng **Mucis** từ máy tính Windows lên máy chủ Cloud/VPS (Ubuntu/Debian) để chạy liên tục 24/7 với liên kết cố định.

---

## 📑 Mục Lục
1. [Bước 1: Commit & Đẩy Mã Nguồn Lên Git Repository từ Windows](#bước-1-commit--đẩy-mã-nguồn-lên-git-repository-từ-windows)
2. [Bước 2: Kết Nối SSH Vào VPS Từ Windows PowerShell](#bước-2-kết-nối-ssh-vào-vps-từ-windows-powershell)
3. [Bước 3: Cài Đặt Docker & Docker Compose Nhanh Trên VPS](#bước-3-cài-đặt-docker--docker-compose-nhanh-trên-vps)
4. [Bước 4: Kéo Code và Khởi Chạy Ứng Dụng Lần Đầu](#bước-4-kéo-code-và-khởi-chạy-ứng-dụng-lần-đầu)
5. [Bước 5: Cập Nhật Ứng Dụng Trong Tương Lai (1-Click Deploy)](#bước-5-cập-nhật-ứng-dụng-trong-tương-lai-1-click-deploy)
6. [Quản Lý & Các Lệnh Thường Dùng](#quản-lý--các-lệnh-thường-dùng)

---

## Bước 1: Commit & Đẩy Mã Nguồn Lên Git Repository từ Windows

Mở **PowerShell** hoặc **Command Prompt** tại thư mục dự án trên máy Windows của bạn:

```powershell
# 1. Kiểm tra trạng thái các file đã thay đổi
git status

# 2. Thêm toàn bộ các file triển khai và mã nguồn
git add .

# 3. Commit với thông điệp rõ ràng
git commit -m "feat: Add production multi-stage Dockerfile, docker-compose, and deploy script"

# 4. Đẩy mã nguồn lên kho lưu trữ GitHub / GitLab của bạn
git push origin main
```

*(Lưu ý: Nếu nhánh chính của bạn là `master`, hãy thay `main` bằng `master`).*

---

## Bước 2: Kết Nối SSH Vào VPS Từ Windows PowerShell

Nhấn tổ hợp phím `Windows + X` trên máy tính và chọn **Windows Terminal** (hoặc **PowerShell**).

Thực hiện lệnh SSH theo cú pháp:

```powershell
ssh root@103.152.22.10
```

> [!CAUTION]
> **LƯU Ý QUAN TRỌNG VỀ ĐỊA CHỈ IP:**
> Tuyệt đối **KHÔNG** để dấu ngoặc nhọn `< >` quanh địa chỉ IP.
> - ❌ **Sai:** `ssh root@<103.152.22.10>`
> - ✅ **Đúng:** `ssh root@103.152.22.10` (hoặc `ssh ubuntu@103.152.22.10` nếu dùng tài khoản ubuntu)

- Khi terminal hỏi: `Are you sure you want to continue connecting (yes/no/[fingerprint])?` -> Gõ `yes` rồi nhấn **Enter**.
- Nhập mật khẩu VPS của bạn khi có yêu cầu (lưu ý khi gõ mật khẩu trên Linux, màn hình sẽ không hiển thị ký tự dấu sao `*`, cứ gõ chính xác rồi nhấn Enter).

---

## Bước 3: Cài Đặt Docker & Docker Compose Nhanh Trên VPS

Khi đã ở trong giao diện dòng lệnh của VPS Linux, chạy 1 lệnh duy nhất để tự động cài đặt phiên bản Docker và Docker Compose mới nhất:

```bash
curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh
```

Kiểm tra Docker đã sẵn sàng:
```bash
docker --version
docker compose version
```

---

## Bước 4: Kéo Code và Khởi Chạy Ứng Dụng Lần Đầu

### 1. Clone kho lưu trữ về máy chủ
```bash
# Clone repository về thư mục mucis
git clone https://github.com/your-username/mucis-app.git mucis

# Di chuyển vào thư mục dự án
cd mucis
```

### 2. Cấp quyền thực thi cho script triển khai
```bash
chmod +x deploy.sh
```

### 3. Kích hoạt triển khai tự động
```bash
./deploy.sh
```

Script sẽ tự động:
1. Tạo thư mục `./data` trên VPS để lưu file SQLite `music_player.db`.
2. Build Docker image tối ưu (Stage 1: build Vite React -> Stage 2: Node.js 20 + Python 3 + FFmpeg).
3. Khởi chạy container ngầm (`daemon mode`) với cơ chế tự khởi động lại khi crash (`restart: always`).
4. Kiểm tra sức khỏe endpoint `/api/health` cho đến khi báo **HEALTHY**.

---

## Bước 5: Cập Nhật Ứng Dụng Trong Tương Lai (1-Click Deploy)

Bất kỳ khi nào bạn sửa code trên máy Windows và `git push` lên GitHub, bạn chỉ cần SSH vào VPS và chạy một lệnh duy nhất:

```bash
cd mucis && ./deploy.sh
```

Script sẽ tự động kéo code mới nhất, build lại image và chuyển đổi container với thời gian gián đoạn (downtime) gần như bằng 0, đồng thời dữ liệu bài hát yêu thích và lịch sử nghe nhạc trong `./data/music_player.db` được bảo toàn 100%.

---

## Quản Lý & Các Lệnh Thường Dùng

| Thao tác | Lệnh thực hiện trên VPS |
| :--- | :--- |
| **Xem logs trực tiếp (Realtime logs)** | `docker compose logs -f` |
| **Kiểm tra trạng thái container** | `docker compose ps` |
| **Khởi động lại container** | `docker compose restart` |
| **Dừng ứng dụng** | `docker compose down` |
| **Kiểm tra file cơ sở dữ liệu SQLite** | `ls -la ./data/` |
| **Sao lưu cơ sở dữ liệu về máy** | `cp ./data/music_player.db ./data/backup_$(date +%F).db` |

---

## 🌐 Địa Chỉ Truy Cập Ứng Dụng 24/7

- **Qua HTTP trực tiếp:**
  ```
  http://DIA_CHI_IP_VPS
  ```
  *(Ví dụ: `http://103.152.22.10` hoặc `http://103.152.22.10:3000`)*

- **Gắn tên miền & SSL Miễn phí (Tùy chọn):**
  Bạn có thể trỏ bản ghi `A` của tên miền về IP của VPS, sau đó sử dụng Cloudflare Proxy (bật đám mây cam 🟠) để có ngay chứng chỉ HTTPS/SSL tự động hoàn toàn miễn phí mà không cần cấu hình phức tạp.
