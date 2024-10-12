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
const accessToken = process.env.YOUR_ACCESS_TOKEN;
const refreshToken = process.env.YOUR_REFRESH_TOKEN;

// Set up Google OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  googleClientId,
  googleClientSecret,
  googleRedirectUri
);

oauth2Client.setCredentials({
  access_token: accessToken,
  refresh_token: refreshToken
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
    const forms = google.forms_v1({ auth: oauth2Client });
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

