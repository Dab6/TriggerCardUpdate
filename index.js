const express = require('express');
const axios = require('axios');
const app = express();
const port = 3000; // Default port

const loyverseApiKey = process.env.LOYVERSE_API_KEY;
const makeWebhookUrl = process.env.MAKE_WEBHOOK_URL;

// Memory store for processed receipt IDs
const processedReceipts = new Set();

// Function to fetch and match customer receipts
async function fetchAndMatchCustomerReceipts() {
  const customerUrl = "https://api.loyverse.com/v1.0/customers";
  const receiptUrl = "https://api.loyverse.com/v1.0/receipts";

  try {
    console.log('Fetching the list of customers...');
    const customerResponse = await axios.get(customerUrl, {
      headers: {
        "Authorization": `Bearer ${loyverseApiKey}`,
        "Content-Type": "application/json"
      }
    });
    const customerData = customerResponse.data;
    console.log('Customers fetched: ', customerData.customers);

    if (customerData && customerData.customers && customerData.customers.length > 0) {
      const customerId = customerData.customers[0].id; // Use the first customer's ID
      console.log('Customer ID: ', customerId);

      console.log('Fetching receipts for customer ID ', customerId, '...');
      const receiptResponse = await axios.get(`${receiptUrl}?customer_id=${customerId}&limit=1`, {
        headers: {
          "Authorization": `Bearer ${loyverseApiKey}`,
          "Content-Type": "application/json"
        }
      });
      const receiptData = receiptResponse.data;
      console.log('Filtered Receipt Data: ', receiptData);

      if (receiptData.receipts && receiptData.receipts.length > 0) {
        const receipt = receiptData.receipts[0];
        const receiptId = receipt.receipt_number;

        if (!processedReceipts.has(receiptId)) {
          processedReceipts.add(receiptId);

          console.log('Sending data to Make.com webhook...');
          console.log('Webhook URL: ', makeWebhookUrl);
          console.log('Payload: ', JSON.stringify(receipt));

          await axios.post(makeWebhookUrl, receipt, {
            headers: {
              "Content-Type": "application/json"
            }
          });
          console.log('Data sent to Make.com webhook.');
        } else {
          console.log('Receipt already processed:', receiptId);
        }
      } else {
        console.log('No receipts found for customer ID:', customerId);
      }
    } else {
      console.log('No customers found.');
    }
  } catch (error) {
    console.error('Error fetching data: ', error.message);
    console.error('Error details: ', error.response ? error.response.data : 'No additional error information.');
  }
}

// Root route
app.get('/', (req, res) => {
  res.send('Server is running. Use /fetch-receipts to trigger the data fetch.');
});

// Route to trigger the function
app.get('/fetch-receipts', async (req, res) => {
  await fetchAndMatchCustomerReceipts();
  res.send('Customer receipts fetched, filtered, and sent to Make.com webhook.');
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});