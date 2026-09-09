import { execSync } from 'child_process';
import { createServer } from 'vite';

// 1. Dọn dẹp các cổng trước khi khởi động
const PORTS = [3000, 5173, 47823];
console.log('[Port Cleaner] Đang kiểm tra và dọn dẹp các tiến trình trên cổng:', PORTS.join(', '));

for (const port of PORTS) {
  try {
    if (process.platform === 'win32') {
      let output = '';
      try {
        output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      } catch {
        continue;
      }
      const lines = output.trim().split('\n');
      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && pid !== String(process.pid)) {
          pids.add(pid);
        }
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          console.log(`[Port Cleaner] Đã đóng tiến trình PID ${pid} đang chiếm cổng ${port}`);
        } catch {}
      }
    } else {
      try {
        execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'ignore' });
      } catch {}
    }
  } catch {}
}
console.log('[Port Cleaner] Hoàn tất! Tất cả cổng sẵn sàng.');

process.on('uncaughtException', (err) => {
  console.error('[Mucis Uncaught Exception]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Mucis Unhandled Rejection]', reason);
});

// 2. Khởi động Vite Server bằng Node API (chạy bền vững, không phụ thuộc cmd.exe)
async function start() {
  try {
    const server = await createServer();
    await server.listen();
    server.printUrls();

    // Giữ tiến trình Node.js luôn sống
    const keepAlive = () => setTimeout(keepAlive, 1000 * 60 * 60);
    keepAlive();
  } catch (err) {
    console.error('[Mucis Dev] Khởi động thất bại:', err);
    process.exit(1);
  }
}

start();
