const generate = require("../../generate")
const fs = require("fs")
const path = require("path")

/**
 * 
 * @param {HttpClient} axios 
 */
module.exports = async (axios) => {
    try {
        let amct = null;
        let fetchtreq = await axios.get('https://login.live.com/login.srf?wa=wsignin1.0&rpsnv=170&checkda=1&rver=7.5.2112.0&wp=MBI_SSL&wreply=https:%2F%2Faccount.microsoft.com%2Fauth%2Fcomplete-silent-signin%3Fru%3Dhttps%3A%2F%2Faccount.microsoft.com%2F%3Flang%3Dfr-FR%26refd%3Daccount.live.com%26refp%3Dlanding%26mkt%3DFR-FR&lc=1036&id=292666')

        let match = fetchtreq.data.match(/<input\s+type="hidden"\s+name="t"\s+id="t"\s+value="([^"]+)"\s*\/?>/)

        // Debug directory setup
        const debugBaseDir = path.join(__dirname, "../../../../debug/amc")
        if (!fs.existsSync(debugBaseDir)) {
            fs.mkdirSync(debugBaseDir, { recursive: true })
        }

        if (!match || !match[1]) {
            // Failed to get T parameter
            const fileName = `failedamct-${generate(16)}.txt`
            const filePath = path.join(debugBaseDir, fileName)
            fs.writeFileSync(filePath, fetchtreq.data, "utf-8")
            return false
        }

        amct = match[1]

        const url = "https://account.microsoft.com/auth/complete-silent-signin?ru=https://account.microsoft.com/?lang=nl-NL&refd=account.live.com&refp=landing&mkt=NL-NL&wa=wsignin1.0"
        const data = `t=${encodeURIComponent(amct)}`

        const headers = {
            "Cache-Control": "max-age=0",
            "Sec-Ch-Ua": "\"Not A(Brand\";v=\"8\", \"Chromium\";v=\"132\"",
            "Origin": "https://login.live.com",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Referer": "https://login.live.com/",
        }

        const response = await axios.post(url, data, {
            headers,
            maxRedirects: 0,
            validateStatus: (status) => status === 302 || status === 200
        })

        const amcAuthCookie = axios.getCookie("AMCSecAuth")
        if (amcAuthCookie) {
            return true
        } else {
            // Failed to get AMC cookie but has T parameter
            const folderName = `failedamc-${generate(16)}`
            const folderPath = path.join(debugBaseDir, folderName)
            fs.mkdirSync(folderPath)

            // Write AMC cookie data
            const amcFileName = `failedamc.amc-${generate(16)}.txt`
            const amcFilePath = path.join(folderPath, amcFileName)
            const amcData = {
                cookies: axios.getCookies(),
                headers: response.headers,
                status: response.status
            }
            fs.writeFileSync(amcFilePath, JSON.stringify(amcData, null, 2), "utf-8")

            // Write T parameter data
            const tFileName = `failedamc.t-${generate(16)}.txt`
            const tFilePath = path.join(folderPath, tFileName)
            fs.writeFileSync(tFilePath, fetchtreq.data, "utf-8")

            return false
        }
    } catch (e) {
        console.log(e)
        return false
    }
}