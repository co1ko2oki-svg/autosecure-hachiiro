const decode = require('./decode');

module.exports = async function confirmtfa(axios, code, proof, rvtkn, apiCanary) {
  const decodedr = decodeURIComponent(rvtkn);

  try {
    const requestData = {
      ProofId: proof,
      TotpCode: code,
      uiflvr: 1001,
      uaid: "b98750aea5644a548609bbcbfab874cb",
      scid: 100109,
      hpgid: 200335
    };

    const response = await axios.post('https://account.live.com/API/AddVerifyTotp', requestData, {
      headers: {
        'Content-Type': 'application/json',
        'canary': apiCanary,
        'hpgid': '200335',
        'scid': '100109',
        'uiflvr': '1001',
        'uaid': 'b98750aea5644a548609bbcbfab874cb'
      }
    });

    if (response.data?.error) {
      console.log(`[confirmtfa] AddVerifyTotp error:`, JSON.stringify(response.data.error));
      return 'retry';
    }

    if (!response.data?.apiCanary) {
      console.log(`[confirmtfa] No apiCanary in AddVerifyTotp response`);
      return 'retry';
    }

    let retries = 3;
    let enableTfaResponse;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        enableTfaResponse = await axios.post(
          `https://account.live.com/proofs/EnableTfa?mkt=en-gb&uaid=d7559d7e02fb4eaf87e688212916f5c4&rvtkn=${decodedr}`,
          null,
          {
            headers: {
              'Content-Type': 'application/json',
              'canary': apiCanary,
              'hpgid': '200335',
              'scid': '100109',
              'uiflvr': '1001',
              'uaid': 'b98750aea5644a548609bbcbfab874cb'
            }
          }
        );

        if (enableTfaResponse.status === 200 && !enableTfaResponse.data?.error) {
          return true;
        }
      } catch (error) {
        console.log(`[confirmtfa] Attempt ${attempt} to enable 2FA failed:`, error.message);
        if (attempt === retries) {
          console.log('[confirmtfa] Max retries reached.');
        } else {
          await new Promise(res => setTimeout(res, 1000));
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error during TFA confirmation:', error);
    return false;
  }
};
