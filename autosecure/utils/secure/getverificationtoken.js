module.exports = async function getverificationtoken(axios){
    try {
        const tokendata = await axios.get('https://account.microsoft.com/profile', {
            proxy: false,
        });
        const match = tokendata.data.match(/<input[^>]*name="__RequestVerificationToken"[^>]*value="([^"]+)"[^>]*>/);
        const token = match ? match[1] : null;
        return token;
    } catch (e) {
        console.error("[GETVERIFICATIONTOKEN] Error:", e.message);
        return null;
    }
}