const generate = require("../../generate")
const fs = require("fs")
const path = require("path")

/**
 * 
 * Split to getT and add checks
 */
module.exports = async (axios) => {
    const amrpTRequest = await axios.get(`https://login.live.com/login.srf?wa=wsignin1.0&rpsnv=21&ct=1708978285&rver=7.5.2156.0&wp=SA_20MIN&wreply=https://account.live.com/proofs/Add?apt=2&uaid=0637740e739c48f6bf118445d579a786&lc=1033&id=38936&mkt=en-US&uaid=0637740e739c48f6bf118445d579a786`);
    let amrpt = amrpTRequest.data.match(/<input\s+type="hidden"\s+name="t"\s+id="t"\s+value="([^"]+)"\s*\/?>/)?.[1];

    if (amrpt) {
        await axios.post(`https://account.live.com/proofs/Add?apt=2&wa=wsignin1.0`, `t=${amrpt}`);

        const amrp = axios.getCookie("AMRPSSecAuth");
        if (amrp) {
            return true;
        } else {
            console.log(`Failed AMRP (With T) | Weird issue`)
            return false;
        }
    } else {
        console.log(`[DEBUG] Failed AMRP T`)
        const dirPath = path.join(__dirname, "../../../../debug/amrpt")
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true })
        }
        const filePath = path.join(dirPath, `${generate(16)}.html`)
        fs.writeFileSync(filePath, amrpTRequest.data, "utf-8")
        return false;
    }
}
