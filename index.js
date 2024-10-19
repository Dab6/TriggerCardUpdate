const express = require('express'); // Import Express framework
const axios = require('axios'); // Import Axios for making HTTP requests

// Environment variables
const LOYVERSE_API_TOKEN = process.env.LOYVERSE_API_TOKEN;
const WEBHOOK_URL_1 = process.env.WEBHOOK_URL_1;
const WEBHOOK_URL_2 = process.env.WEBHOOK_URL_2;
const WEBHOOK_URL_3 = process.env.WEBHOOK_URL_3;
const updatePointsUrl = process.env.UPDATE_POINTS_URL; // URL to update points
const customerUrl = "https://api.loyverse.com/v1.0/customers"; // Loyverse API URL for customers

const app = express(); // Create an Express application
const PORT = process.env.PORT || 3000;

// Array of webhook URLs
const webhookUrls = [WEBHOOK_URL_1, WEBHOOK_URL_2, WEBHOOK_URL_3];
let currentWebhookIndex = 0; // Index to track current webhook

// Cache to store the last known points of each customer
let customerPointCache = {};
let isFirstRun = true; // Flag to indicate the first run

// Function to fetch customers from Loyverse
async function fetchCustomers() {
    try {
        const response = await axios.get(customerUrl, {
            headers: {
                'Authorization': `Bearer ${LOYVERSE_API_TOKEN}`
            }
        });
        // Ensure the response data contains customers
        if (response.data && response.data.customers) {
            return response.data.customers;
        } else {
            console.error('Unexpected response format:', response.data);
            return [];
        }
    } catch (error) {
        console.error('Error fetching customers from Loyverse:', error.message);
        return [];
    }
}

// Function to fetch card data and map customer codes for a specific customer
async function fetchAndMapCardForCustomer(customer) {
    try {
        const response = await axios.get(updatePointsUrl);
        const cardData = response.data.data.cards;

        const matchedCard = cardData.find(card => card.barcodeValue === customer.customer_code);
        if (matchedCard) {
            customer.match_card_id = matchedCard.id; // Assign match_card_id
        }
    } catch (error) {
        console.error('Error fetching card data: ', error.message);
    }
}

// Function to check for point balance changes
async function checkForPointUpdates() {
    const customers = await fetchCustomers();

    for (const customer of customers) {
        const { id, name, total_points, customer_code } = customer;

        // Initialize the cache during the first run without triggering the webhook
        if (isFirstRun) {
            customerPointCache[id] = total_points;
        } else {
            const previousPoints = customerPointCache[id] || 0;

            // Detect change in total_points
            if (total_points !== previousPoints) {
                console.log(`Points update detected for ${name}: ${previousPoints} -> ${total_points}`);

                // Update the cache with the new points
                customerPointCache[id] = total_points;

                // Fetch card data and map customer code for the updated customer
                await fetchAndMapCardForCustomer(customer);

                // Trigger the webhook for this customer
                let success = false;
                while (!success && currentWebhookIndex < webhookUrls.length) {
                    success = await sendToWebhook(customer, webhookUrls[currentWebhookIndex]);
                    if (!success) {
                        currentWebhookIndex = (currentWebhookIndex + 1) % webhookUrls.length; // Move to next webhook if failed
                    }
                }
                if (success) {
                    console.log(`Data successfully sent to webhook for ${customer.name}.`);
                } else {
                    console.error(`Failed to send data to any webhook for ${customer.name}.`);
                }

                break; // Only one customer included in the payload at any point
            }
        }
    }

    // After the first run, set the flag to false
    if (isFirstRun) {
        console.log('Cache initialized on first run.');
        isFirstRun = false;
    }
}

// Function to send data to a webhook
async function sendToWebhook(customer, url) {
    try {
        const response = await axios.post(url, {
            customer_id: customer.id,
            name: customer.name,
            points_balance: customer.total_points,
            email: customer.email,
            phone_number: customer.phone_number,
            total_spent: customer.total_spent,
            customer_code: customer.customer_code,
            match_card_id: customer.match_card_id // Added match_card_id
        }, {
            headers: { "Content-Type": "application/json" }
        });

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

// Endpoint to manually check for point updates
app.get('/check-updates', async (req, res) => {
    await checkForPointUpdates();
    res.send('Checked for customer point updates.');
});

// Start the Express server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Manual update check endpoint available at /check-updates');
});
