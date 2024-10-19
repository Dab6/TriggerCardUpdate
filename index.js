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
const maxRetries = 3; // Maximum number of retries per webhook
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
            },
            timeout: 5000 // Set timeout to handle network delays
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
    let retries = 0;
    const maxRetries = 3;
    let timeout = 10000; // Initial timeout of 10 seconds

    while (retries < maxRetries) {
        try {
            const response = await axios.get(updatePointsUrl, { timeout: timeout });
            const cardData = response.data.data.cards;

            const matchedCard = cardData.find(card => card.barcodeValue === customer.customer_code);
            if (matchedCard) {
                customer.match_card_id = matchedCard.id; // Assign match_card_id
            }
            return; // Exit if successful
        } catch (error) {
            console.error('Error fetching card data: ', error.message);
            retries++;
            timeout *= 2; // Exponentially increase the timeout
            console.log(`Retrying to fetch card data. Attempt ${retries} with timeout ${timeout} ms`);
        }
    }
    console.error('Failed to fetch card data after multiple attempts.');
}

// Function to check for point balance changes
async function checkForPointUpdates() {
    const customers = await fetchCustomers();
    const currentCustomerIds = new Set(customers.map(customer => customer.id));

    // Add new customers to cache without triggering the webhook
    customers.forEach(customer => {
        if (!(customer.id in customerPointCache)) {
            customerPointCache[customer.id] = customer.total_points;
        }
    });

    // Remove customers from cache if they no longer exist
    Object.keys(customerPointCache).forEach(customerId => {
        if (!currentCustomerIds.has(customerId)) {
            delete customerPointCache[customerId];
        }
    });

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
                let retries = 0;
                while (!success && currentWebhookIndex < webhookUrls.length) {
                    const webhookUrl = webhookUrls[currentWebhookIndex];
                    if (!webhookUrl) {
                        console.error(`Webhook URL at index ${currentWebhookIndex} is undefined.`);
                        currentWebhookIndex = (currentWebhookIndex + 1) % webhookUrls.length; // Move to next webhook
                        continue;
                    }
                    success = await sendToWebhook(customer, webhookUrl);
                    if (!success) {
                        retries++;
                        if (retries >= maxRetries) {
                            currentWebhookIndex = (currentWebhookIndex + 1) % webhookUrls.length; // Move to next webhook if max retries reached
                            retries = 0; // Reset retries counter for the next webhook
                        } else {
                            console.warn(`Retrying webhook for ${customer.name}. Attempt ${retries + 1}`);
                        }
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
            headers: { "Content-Type": "application/json" },
            timeout: 5000 // Set timeout to handle network delays
        });

        if (response.status === 200 && response.data === "Accepted") {
            return true; // Successful response
        } else {
            throw new Error('Non-accepted response'); // If response is not "Accepted"
        }
    } catch (error) {
        console.error(`Webhook at ${url} failed, trying next webhook. Error: ${error.message}`);
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