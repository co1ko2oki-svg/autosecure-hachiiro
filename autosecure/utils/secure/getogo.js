

async function getogo(axios) {
  try {
    const response = await axios.get(`https://account.microsoft.com/profile/api/v1/personal-info`, {
      headers: {
          "X-Requested-With": "XMLHttpRequest",
      }
  });
    

    if (!response?.data || typeof response.data !== 'object') {
      return null;
    }

    const email = response.data.signInEmail || response.data.email || null;
    const firstname = response.data.firstName || null;
    const lastname = response.data.lastName || null;
    const birthday = response.data.birthday || null;
    const country = response.data.region || null;
    const extractedData = {
      email,
      firstname,
      lastname,
      birthday,
      country
    };
    const jsondata = JSON.stringify(extractedData, null, 2);
    return jsondata;

  } catch (error) {
    if (error.response) {
      console.error('Error response status:', error.response.status);
      console.error('Error response reason:', error.response.statusText);
      console.error('Error response data:', error.response.data);
    } else if (error.request) {
      console.error('No response received:', error.message || error.request);
    } else {
      console.error('Error message:', error.message);
    }
    return null;
  }
}

module.exports = getogo;