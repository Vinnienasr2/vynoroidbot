/**
 * M-Pesa payment service
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

function logErrorToFile(error) {
  const logPath = path.join(__dirname, '../../logs/error.log');
  const logMsg = `[${new Date().toISOString()}] ${typeof error === 'string' ? error : JSON.stringify(error)}\n`;
  fs.appendFile(logPath, logMsg, err => {
    if (err) console.error('Failed to write error log:', err);
  });
}
const { query } = require('../config/database');

/**
 * Generate OAuth token for M-Pesa API
 */
const generateMpesaToken = async (consumerKey, consumerSecret) => {
  try {
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const response = await axios({
      method: 'GET',
      url: 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      headers: {
        'Authorization': `Basic ${auth}`
      }
    });
    return response.data.access_token;
  } catch (error) {
    logErrorToFile(error);
    throw new Error('Failed to connect to M-Pesa. Please try again later.');
  }
};

/**
 * Initiate M-Pesa STK Push
 */
const initiateMpesaPayment = async (phoneNumber, amount, transactionCode) => {
  try {
    // Get M-Pesa settings from environment variables
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    const passKey = process.env.MPESA_PASSKEY;
    const businessShortCode = process.env.MPESA_SHORTCODE;
    const callbackUrl = process.env.MPESA_CALLBACK_URL;

    // Check if M-Pesa is configured
    if (!consumerKey || !consumerSecret || !passKey || !businessShortCode) {
      throw new Error('M-Pesa not properly configured');
    }

    // Generate OAuth token
    const token = await generateMpesaToken(consumerKey, consumerSecret);

    // Generate timestamp in the format YYYYMMDDHHmmss
    const timestamp = new Date().toISOString().replace(/[-T:\.Z]/g, '').slice(0, 14);

    // Generate password (base64 of shortcode + passkey + timestamp)
    const password = Buffer.from(`${businessShortCode}${passKey}${timestamp}`).toString('base64');

    // Prepare request payload
    const requestData = {
      BusinessShortCode: businessShortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: parseInt(amount, 10), // Ensure Amount is integer
      PartyA: phoneNumber,
      PartyB: businessShortCode,
      PhoneNumber: phoneNumber,
      CallBackURL: callbackUrl,
      AccountReference: transactionCode,
      TransactionDesc: `Payment for transaction ${transactionCode}`
    };
    
    // Send STK push request
    const response = await axios({
      method: 'POST',
      url: 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: requestData
    });
    
    console.log('M-Pesa STK push response:', response.data);
    
    // Return response
    return {
      success: true,
      checkoutRequestID: response.data.CheckoutRequestID,
      responseCode: response.data.ResponseCode,
      responseDescription: response.data.ResponseDescription
    };
    
  } catch (error) {
    console.error('Error initiating M-Pesa payment:', error);
    
    return {
      success: false,
      error: error.message || 'Failed to process M-Pesa payment'
    };
  }
};

/**
 * Process M-Pesa callback
 */
const processMpesaCallback = async (callbackData) => {
  try {
    // Get top-level fields
    const merchantRequestID = callbackData.Body.stkCallback.MerchantRequestID;
    const checkoutRequestID = callbackData.Body.stkCallback.CheckoutRequestID;
    const resultCode = callbackData.Body.stkCallback.ResultCode;
    const resultDesc = callbackData.Body.stkCallback.ResultDesc;

    if (resultCode !== 0) {
      console.log('M-Pesa transaction failed:', resultDesc);
      try {
        // ...existing code...
        // Send STK push request
        const response = await axios({
          method: 'POST',
          url: 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          data: requestData
        });
        console.log('M-Pesa STK push response:', response.data);
        // Return response
        return {
          success: true,
          checkoutRequestID: response.data.CheckoutRequestID,
          responseCode: response.data.ResponseCode,
          responseDescription: response.data.ResponseDescription
        };
      } catch (error) {
        logErrorToFile(error);
        return {
          success: false,
          error: 'Failed to initiate payment. Please check your details and try again.'
        };
      }
      //   
    
    };

    if (updateResult.affectedRows === 0) {
      console.error('No transaction found with code:', transactionCode);
      return false;
    }

    console.log(`Transaction ${transactionCode} completed successfully`);
    return true;
    
  } catch (error) {
    console.error('Error processing M-Pesa callback:', error);
    return false;
  }
};

/**
 * Check M-Pesa transaction status
 */
const checkTransactionStatus = async (checkoutRequestID) => {
  try {
    // Get M-Pesa settings from environment variables
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    const passKey = process.env.MPESA_PASSKEY;
    const businessShortCode = process.env.MPESA_SHORTCODE;

    // Generate OAuth token
    const token = await generateMpesaToken(consumerKey, consumerSecret);

    // Generate timestamp in the format YYYYMMDDHHmmss
    const timestamp = new Date().toISOString().replace(/[-T:\.Z]/g, '').slice(0, 14);

    // Generate password (base64 of shortcode + passkey + timestamp)
    const password = Buffer.from(`${businessShortCode}${passKey}${timestamp}`).toString('base64');

    // Prepare request payload
    const requestData = {
      BusinessShortCode: businessShortCode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestID
    };
    
    // Send query request
    const response = await axios({
      method: 'POST',
      url: 'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: requestData
    });
    
    console.log('M-Pesa transaction status response:', response.data);
    
    // Check result code
      if (response.data.ResultCode === '0') {
        // Transaction successful
        return {
          success: true,
          status: 'SUCCESS',
          message: response.data.ResultDesc || 'Transaction completed successfully',
          data: response.data
        };
      } else {
        // Transaction failed or pending
        return {
          success: false,
          status: response.data.ResultCode,
          message: response.data.ResultDesc || 'Transaction not successful',
          data: response.data
        };
      }
    } catch (error) {
      console.error('Error checking M-Pesa transaction status:', error);
      return {
        success: false,
        status: 'ERROR',
        message: error.message || 'Failed to check transaction status'
      };
    }
};

module.exports = {
  initiateMpesaPayment,
  processMpesaCallback,
  checkTransactionStatus
};