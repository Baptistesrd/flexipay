// Single Stripe client instance shared across the application.
// dotenv must be loaded before this module is first required.
const Stripe = require("stripe");

module.exports = Stripe(process.env.STRIPE_SECRET_KEY);
