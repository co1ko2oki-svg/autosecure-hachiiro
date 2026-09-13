process.env.RUN_ALL_MODE = 'true';

const { startBot } = require('./autosecure.js');
const { startBackend } = require('./servers/backendServer.js');
const { startFrontend } = require('./servers/frontendServer.js');

async function startAll() {
    try {
        console.log("======================================================");
        console.log("🚀 Đang khởi động toàn bộ hệ thống (Bot + Web + API)...");
        console.log("======================================================");

        // 1. Khởi động Backend
        await startBackend();

        // 2. Khởi động Frontend
        await startFrontend();

        // 3. Khởi động Bot Discord
        await startBot();

        console.log("\n======================================================");
        console.log("🎉 TẤT CẢ DỊCH VỤ ĐÃ HOẠT ĐỘNG TRÊN CÙNG 1 PROCESS!");
        console.log("======================================================");
    } catch (error) {
        console.error("❌ Có lỗi trong quá trình khởi động hệ thống:", error);
    }
}

startAll();
