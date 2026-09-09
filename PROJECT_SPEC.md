# Custom Music App (YouTube Music Auto-Sync)

## 1. Mục tiêu & Luồng chính
- Ứng dụng nghe nhạc với giao diện custom độc bản (không dùng style Spotify).
- Tự động track nghệ sĩ yêu thích từ YouTube Music qua kênh/ID và thêm bài hát mới vào playlist riêng.
- Phát nhạc trực tiếp chất lượng cao (trích xuất stream từ YouTube).

## 2. Tech Stack lựa chọn
- Framework: Electron + Vite + React + Tailwind CSS
- UI Components: Floating Dock, Dynamic Ambient Mesh Gradient, Framer/CSS animation, Web Audio API Visualizer.
- Audio Engine: Trích xuất audio stream từ YouTube bằng service Python backend tích hợp `ytmusicapi` & `yt-dlp` (kèm Invidious dual fallback).
- Database local: SQLite (lưu trữ Artists, Tracks, Playlists, Cached Streams).

## 3. Phong cách Giao diện (Custom UI)
- Tránh xa layout 3 cột truyền thống của Spotify.
- Nền động (mesh gradient) trích xuất màu từ Album Art.
- Bộ điều khiển floating dock tối giản, thanh seekbar tùy biến hiệu ứng sóng sáng, live audio visualizer.
- Chế độ Zen Mode nghe nhạc toàn màn hình với đĩa vinyl xoay chân thực.
