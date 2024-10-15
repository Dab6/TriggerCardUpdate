const express = require('express'); // Import express module
const axios = require('axios'); // Import axios module for HTTP requests
const app = express(); // Create an Express application
const port = process.env.PORT || 3000; // Set the port to listen on
const loyverseApiKey = process.env.LOYVERSE_API_KEY; // API key for Loyverse
// Array of webhook URLs
const webhookUrls = [
  process.env.MAKE_WEBHOOK_URL_1,
  process.env.MAKE_WEBHOOK_URL_2,
  process.env.MAKE_WEBHOOK_URL_3,
  process.env.MAKE_WEBHOOK_URL_4,
];
let currentWebhookIndex = 0; // Index to track current webhook

const processedReceipts = new Set(); // Set to store processed receipt IDs
const savedCustomers = new Set(); // Set to store saved customer IDs

// Function to send data to a webhook
async function sendToWebhook(receipt, url) {
  try {
    const response = await axios.post(url, receipt, {
      headers: {
        "Content-Type": "application/json"
      }
    });
    // Check if the response status is 200 and body is "Accepted"
    if (response.status === 200 && response.data === "Accepted") {
      return true; // Successful response
    } else {
      throw new Error('Non-accepted response'); // If response is not "Accepted"
    }
  } catch (error) {
    console.error(`Webhook at ${url} failed, trying next webhook.`);
    return false; // Failed response
  }
}

// Function to fetch and match customer receipts
async function fetchAndMatchCustomerReceipts() {
  const customerUrl = "https://api.loyverse.com/v1.0/customers"; // Loyverse API URL for customers
  const receiptUrl = "https://api.loyverse.com/v1.0/receipts"; // Loyverse API URL for receipts
  try {
    const customerResponse = await axios.get(customerUrl, {
      headers: {
        "Authorization": `Bearer ${loyverseApiKey}`,
        "Content-Type": "application/json"
      }
    });
    const customerData = customerResponse.data;

    // Store customer IDs
    customerData.customers.forEach(customer => {
      savedCustomers.add(customer.id);
    });

    if (customerData && customerData.customers && customerData.customers.length > 0) {
      const customerId = customerData.customers[0].id; // Get the first customer's ID
      const receiptResponse = await axios.get(`${receiptUrl}?customer_id=${customerId}&limit=1`, {
        headers: {
          "Authorization": `Bearer ${loyverseApiKey}`,
          "Content-Type": "application/json"
        }
      });
      const receiptData = receiptResponse.data;

      if (receiptData.receipts && receiptData.receipts.length > 0) {
        const receipt = receiptData.receipts[0]; // Get the first receipt
        const receiptId = receipt.receipt_number;
        const receiptCustomerId = receipt.customer_id;

        if (!processedReceipts.has(receiptId) && savedCustomers.has(receiptCustomerId)) {
          processedReceipts.add(receiptId); // Add receipt ID to processed set

          let success = false;
          while (!success && currentWebhookIndex < webhookUrls.length) {
            success = await sendToWebhook(receipt, webhookUrls[currentWebhookIndex]); // Try sending to current webhook
            if (!success) {
              currentWebhookIndex = (currentWebhookIndex + 1) % webhookUrls.length; // Move to next webhook if failed
            }
          }

          if (success) {
            console.log('Data successfully sent to webhook.');
          } else {
            console.error('Failed to send data to any webhook.');
          }
        } else {
          console.log('Receipt already processed or customer not saved:', receiptId);
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

// Route to trigger the function manually
app.get('/fetch-receipts', async (req, res) => {
  await fetchAndMatchCustomerReceipts();
  res.send('Customer receipts fetched, filtered, and sent to Make.com webhook.');
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
