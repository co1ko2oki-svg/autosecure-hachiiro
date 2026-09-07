module.exports = async function RemoveAppPasswords(axios, canary) {
  try {
    const getResponse = await axios.get("https://account.live.com/proofs/manage/additional/")
    
    let uaid = '423f2d2d46204392b7ed97b293248ef5';
    if (typeof getResponse.data === 'string') {
      const uaidMatch = getResponse.data.match(/"uaid"\s*:\s*"([^"]+)"/);
      if (uaidMatch && uaidMatch[1]) {
        uaid = uaidMatch[1];
      }
    }

    const postResponse = await axios.post("https://account.live.com/API/Proofs/DeleteAppPassword", {
      uiflvr: 1001,
      uaid: uaid,
      scid: 100109,
      hpgid: 201030
    }, {
      headers: {
        'Content-Type': 'application/json',
        "X-Requested-With": "XMLHttpRequest",
        'Accept': 'application/json',
        ...(canary ? { 'canary': canary } : {})
      }
    });

    console.log(`removepw: ${JSON.stringify(postResponse.data)}`)

    if (postResponse.data?.apiCanary || postResponse.status === 200) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error while removing app passwords:', error.message);
    if (error.response) {
      console.log('API Response data:', error.response.data);
      console.log('Status code:', error.response.status);
    }
    return false;
  }
};