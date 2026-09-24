try {
  const { attachGlobalLoggerGuard } = require('./autosecure/utils/logging/interceptLogger');
  if (attachGlobalLoggerGuard) attachGlobalLoggerGuard();
} catch (e) {}

process.env.RUN_ALL_MODE = 'true';

// Enforce maxHeaderSize of at least 512KB across all HTTP/HTTPS requests
const http = require('http');
const https = require('https');
function patchMaxHeaderSize(mod) {
  if (!mod || mod._maxHeaderSizePatched) return;
  mod._maxHeaderSizePatched = true;
  const orig = mod.request;
  mod.request = function (url, options, cb) {
    let opts = options;
    let callback = cb;
    if (typeof url === 'string' || url instanceof URL) {
      if (typeof options === 'function') {
        callback = options;
        opts = {};
      } else {
        opts = options ? { ...options } : {};
      }
      if (!opts.maxHeaderSize || opts.maxHeaderSize < 524288) opts.maxHeaderSize = 524288;
      return orig.call(mod, url, opts, callback);
    } else {
      opts = url ? { ...url } : {};
      callback = options;
      if (!opts.maxHeaderSize || opts.maxHeaderSize < 524288) opts.maxHeaderSize = 524288;
      return orig.call(mod, opts, callback);
    }
  };
}
patchMaxHeaderSize(http);
patchMaxHeaderSize(https);

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
