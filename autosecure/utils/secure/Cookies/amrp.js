const generate = require("../../generate")
const fs = require("fs")
const path = require("path")

function extractT(html) {
    if (!html || typeof html !== "string") return null;
    let match = html.match(/<input[^>]+name=["']t["'][^>]+value=["']([^"']+)["']/i);
    if (match && match[1]) return match[1];
    match = html.match(/<input[^>]+value=["']([^"']+)["'][^>]+name=["']t["']/i);
    if (match && match[1]) return match[1];
    match = html.match(/name="t"\s+id="t"\s+value="([^"]+)"/i);
    if (match && match[1]) return match[1];
    match = html.match(/name=["']?t["']?[^>]*value=["']([^"']+)["']/i);
    if (match && match[1]) return match[1];
    match = html.match(/value=["']([^"']+)["'][^>]*name=["']?t["']?/i);
    if (match && match[1]) return match[1];
    return null;
}

module.exports = async (axios) => {
    try {
        if (axios.getCookie && axios.getCookie("AMRPSSecAuth")) {
            return true;
        }

        const now = Math.floor(Date.now() / 1000);
        const dynamicUaid = generate(32).toLowerCase();
        const amrpUrl = `https://login.live.com/login.srf?wa=wsignin1.0&rpsnv=21&ct=${now}&rver=7.5.2156.0&wp=SA_20MIN&wreply=https://account.live.com/proofs/Add?apt=2&uaid=${dynamicUaid}&lc=1033&id=38936&mkt=en-US&uaid=${dynamicUaid}`;

        const amrpTRequest = await axios.get(amrpUrl, {
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400
        });

        if (axios.getCookie && axios.getCookie("AMRPSSecAuth")) {
            return true;
        }

        let amrpt = extractT(amrpTRequest?.data);
        if (!amrpt && amrpTRequest?.headers?.location) {
            try {
                const loc = new URL(amrpTRequest.headers.location, "https://account.live.com");
                amrpt = loc.searchParams.get("t");
            } catch (e) {}
        }

        if (amrpt) {
            await axios.post(`https://account.live.com/proofs/Add?apt=2&wa=wsignin1.0`, `t=${encodeURIComponent(amrpt)}`, {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 400
            });

            const amrp = axios.getCookie("AMRPSSecAuth");
            if (amrp) {
                return true;
            } else {
                console.log(`Failed AMRP (With T) | Weird issue`);
                return false;
            }
        } else {
            console.log(`[DEBUG] Failed AMRP T`);
            if (process.env.ENABLE_DEBUG_DUMPS === "true") {
                try {
                    const dirPath = path.join(__dirname, "../../../../debug/amrpt");
                    if (!fs.existsSync(dirPath)) {
                        fs.mkdirSync(dirPath, { recursive: true });
                    }
                    const filePath = path.join(dirPath, `${generate(16)}.html`);
                    fs.writeFileSync(filePath, amrpTRequest?.data || "", "utf-8");
                } catch (err) {}
            }
            return false;
        }
    } catch (e) {
        console.error("Error in amrp.js:", e.message);
        return false;
    }
};
