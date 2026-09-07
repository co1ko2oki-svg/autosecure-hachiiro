const fs = require('fs');
const path = require('path');

/**
 * Monitors a folder and deletes image files older than delaySeconds.
 * @param {string} folderPath - The absolute or relative path to the folder you want to watch.
 * @param {number} [delaySeconds=30] - Delay before deletion in seconds (optional).
 */
function startFolderMonitor(folderPath, delaySeconds = 30) {
    const absolutePath = path.resolve(folderPath);
    const validExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

    console.log(`[Monitor] Watching folder: ${absolutePath}`);

    if (!fs.existsSync(absolutePath)) {
        fs.mkdirSync(absolutePath, { recursive: true });
    }

    const cleanOldFiles = () => {
        try {
            const files = fs.readdirSync(absolutePath);
            const now = Date.now();
            for (const file of files) {
                const ext = path.extname(file).toLowerCase();
                if (!validExtensions.includes(ext)) continue;
                
                const filePath = path.join(absolutePath, file);
                try {
                    const stats = fs.statSync(filePath);
                    if (now - stats.mtimeMs > delaySeconds * 1000) {
                        fs.unlink(filePath, (err) => {
                            if (err) console.error(`[image] Failed to delete`, err.message);
                        });
                    }
                } catch (e) {
                    console.error(`[image] Error checking file ${filePath}`, e.message);
                }
            }
        } catch (e) {
            console.error(`[Monitor] Error reading directory ${absolutePath}`, e.message);
        }
    };

    // Run once on startup to clear any files left from previous run
    cleanOldFiles();
    
    // Check every 10 seconds
    setInterval(cleanOldFiles, 10 * 1000);
}

module.exports = { startFolderMonitor };
