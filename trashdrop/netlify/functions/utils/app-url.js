/**
 * Address of the household app, used in the links WhatsApp messages send.
 * Set APP_URL in the Netlify site settings to change it; no trailing slash.
 */
const APP_URL = (process.env.APP_URL || 'https://app.trashdrops.com').replace(/\/+$/, '');

module.exports = { APP_URL };
