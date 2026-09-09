# Custom Desktop Music Player - Architecture Spec

## 1. Mục tiêu
- Desktop App nghe nhạc (Windows/macOS/Linux) với giao diện độc bản (Custom UI, không dùng layout Spotify).
- Quản lý danh sách nghệ sĩ yêu thích, tự động dò tìm bài mới trên YouTube Music và đẩy vào playlist.
- Phát nhạc trực tiếp chất lượng cao (trích xuất stream từ YouTube).

## 2. Tech Stack lựa chọn
- Framework: Tauri (v2) + React + Tailwind CSS (hoặc Electron + React)
- UI Language: Framer Motion cho animation, Lucide icons, dynamic background gradient dựa theo bìa album.
- Audio Pipeline: Web Audio API / Howler.js trên frontend.
- YouTube & Sync Core: 
  - Backend chạy service giải mã stream URL và crawl metadata (sử dụng ytmusicapi / yt-dlp binary đóng gói cùng app).
  - Database local: SQLite (lưu Artists, Tracks, Cached Streams, Playlists).

## 3. Quy tắc làm việc cho Agent
- Chia nhỏ thành từng Milestone, code xong phần nào phải kiểm tra compile/build được phần đó.
- Không hardcode dữ liệu giả dài hạn; ưu tiên luồng fetch thật.
- Giữ giao diện tối giản, phong cách hiện đại với floating controls và album art chuyển màu.

## 4. Kiến trúc Local-First: Bỏ Auth, Cào nhạc công khai & Local AI Profiling

### A. Nguồn nhạc YouTube Music (Anonymous)
- Xóa bỏ hoàn toàn luồng đăng nhập (OAuth, Cookie, WebView).
- Mọi truy vấn bài hát, tìm kiếm artist, lấy bài mới đều dùng ytmusicapi/scraper ở chế độ Guest/Unauthenticated.

### B. Local Playback & Behavior Tracking (Lưu vết trên máy)
- Lưu lịch sử nghe cục bộ vào SQLite/IndexedDB:
  - Bảng Tracks, Playlists, PlayHistory (track_id, title, artist, listened_at, completed, liked).
  - Ghi nhận trạng thái: Thả tim (Favorite), Số lần phát lại (Play count), Bỏ qua sớm (Skip).

### C. AI Taste Profiler & Smart Playlist Generator
- Khi tạo playlist gợi ý, trích xuất dữ liệu từ Local PlayHistory:
  - Lọc ra 20-30 bài hát có điểm tương tác cao nhất (thả tim + nghe trọn vẹn).
  - Gửi danh sách qua Gemini API để phân tích mood, BPM và gu âm nhạc cá nhân.
  - Gemini trả về danh sách các track/query tương tự.
  - App dùng query đó tìm kiếm trên YouTube Music để nạp danh sách "AI For You" cục bộ.