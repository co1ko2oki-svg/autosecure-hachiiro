const amc = require("./amc");
const amcjwt = require("./amcjwt");
const amrp = require("./amrp");
const verificationToken = require("./verificationToken");
const fs = require('fs');

const logDuration = (funcName, startTime) => {
    const duration = (Date.now() - startTime) / 1000;
    //console.log(`[${funcName}] took ${duration.toFixed(2)} seconds`);
};

module.exports = async function cookies(axios) {
    const data = {
        cookies: {
            amc: null,
            amrp: null,
            jwt: null,
            token: null
        },
        status: null,
        newaxios: axios
    };

    const cookieStart = Date.now();

    try {
        const [amrpResult, amcResult] = await Promise.all([
            amrp(axios),
            amc(axios)
        ]);

        const jwtResult = await amcjwt(axios);

        if (axios.getCookie("AMRPSSecAuth")) {
            console.log("Got AMRP");
            data.cookies.amrp = axios.getCookie("AMRPSSecAuth");
        } else {
            console.log("Failed to get AMRP");
        }

        if (axios.getCookie("AMCSecAuth")) {
            console.log("Got AMC");
            data.cookies.amc = axios.getCookie("AMCSecAuth");
        } else {
            console.log("Failed to get AMC");
            data.status = "noamc";
        }

        if (axios.getCookie("AMCSecAuthJWT")) {
            console.log("Got AMCJWT");
            data.cookies.jwt = axios.getCookie("AMCSecAuthJWT");
        } else {
            console.log("Failed to get AMCJWT");
        }

        if (!axios.getCookie("AMCSecAuth") && !axios.getCookie("AMRPSSecAuth")) {
            console.log(`Don't have AMC & AMRP! Retrying once after 1s delay...`);
            await new Promise(r => setTimeout(r, 1000));
            await Promise.all([amrp(axios), amc(axios)]);
            if (axios.getCookie("AMRPSSecAuth")) {
                console.log("Got AMRP on retry");
                data.cookies.amrp = axios.getCookie("AMRPSSecAuth");
            }
            if (axios.getCookie("AMCSecAuth")) {
                console.log("Got AMC on retry");
                data.cookies.amc = axios.getCookie("AMCSecAuth");
                data.status = null;
            }
            if (!axios.getCookie("AMCSecAuth") && !axios.getCookie("AMRPSSecAuth")) {
                console.log(`Still don't have AMC & AMRP after retry!`);
                data.status = "unauthed";
            }
        }

      //  logDuration("all cookies", cookieStart);
        return data;

    } catch (error) {
        console.error("Failed while getting cookies:", error);
        logDuration("all cookies", cookieStart);
        return data;
    }
};
