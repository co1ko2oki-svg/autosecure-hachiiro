const axios = require("axios")
module.exports = async (device) => {
    const { data } = await axios({
        url: "https://login.live.com/GetOneTimeCode.srf?id=38936",
        "headers": {
            "cookie": process.env.MS_AUTH_COOKIE || ""
        },
        "data": `login=${encodeURIComponent(process.env.MS_LOGIN_EMAIL || "")}&flowtoken=${encodeURIComponent(device)}&purpose=eOTT_RemoteNGC&channel=PushNotifications&SAPId=&lcid=1033&uaid=${encodeURIComponent(process.env.MS_UAID || "")}&canaryFlowToken=${encodeURIComponent(process.env.MS_CANARY_FLOW_TOKEN || "")}`,
        "method": "POST"
    });
    return data?.DisplaySignForUI
}