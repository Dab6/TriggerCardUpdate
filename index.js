const axios = require('axios');
const { google } = require('googleapis');
const express = require('express');
const app = express();

// Environment variables
const makeScenarioUrl = process.env.MAKE_SCENARIO_URL;
const makeAccessToken = process.env.MAKE_ACCESS_TOKEN;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI;
const googleFormId = process.env.GOOGLE_FORM_ID;

// Set up Google OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  googleClientId,
  googleClientSecret,
  googleRedirectUri
);

// Function to get a new token and set credentials
const getNewToken = async () => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/forms.responses.readonly']
  });
  console.log('Authorize this app by visiting this url:', authUrl);

  // After you obtain the code, set it here
  const code = 'ya29.a0AcM612ygVu82c5LIkg4okmTh2pgKvb5xZkvGAlYGxrDi8HY7WyEHE4ZumdosE3qJEBsCq5wP26mgTrjawGIy1Ww_WBccQ7pIbYWN2dyMdTRmQ2TNTOF6PqMUqGqWD-AKvCe77zhteDoOy-QAyWVzBaTMSrpeK01CjypMpT_5aCgYKAaASARMSFQHGX2MiKzbgcNdde903f6zZODMVwQ0175';
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
};

// Call getNewToken and set credentials
getNewToken().then(() => {
  console.log('Google OAuth2 client authorized successfully');
});

// Function to trigger Make.com scenario
const triggerMakeScenario = async () => {
  try {
    await axios.post(makeScenarioUrl, {}, {
      headers: {
        'Authorization': `Bearer ${makeAccessToken}`
      }
    });
    console.log('Make.com scenario triggered successfully');
  } catch (error) {
    console.error('Error triggering Make.com scenario:', error);
  }
};

// Function to check for new form responses
const checkForNewResponses = async () => {
  try {
    const forms = google.forms({ version: 'v1', auth: oauth2Client });
    const response = await forms.forms.responses.list({
      formId: googleFormId
    });
    const formResponses = response.data.responses;
    if (formResponses && formResponses.length > 0) {
      // Trigger Make.com scenario if there are new responses
      await triggerMakeScenario();
    }
  } catch (error) {
    console.error('Error fetching form responses:', error);
  }
};

// Set interval to check for new responses every minute
setInterval(checkForNewResponses, 60000); // 60,000ms = 1 minute

// Start the Express server
app.listen(3000, () => {
  console.log('Server running on port 3000');
});
