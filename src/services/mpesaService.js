/**
 * M-Pesa payment service
 */
const axios = require('axios');
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
    console.error('Error generating M-Pesa token:', error);
    throw new Error('Failed to generate M-Pesa authentication token');
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
      Amount: amount,
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
    // Check if it's a successful transaction
    const resultCode = callbackData.Body.stkCallback.ResultCode;
    
    if (resultCode !== 0) {
      console.log('M-Pesa transaction failed:', callbackData.Body.stkCallback.ResultDesc);
      return false;
    }
    
    // Get transaction details
    const callbackMetadata = callbackData.Body.stkCallback.CallbackMetadata.Item;
    const amount = callbackMetadata.find(item => item.Name === 'Amount').Value;
    const mpesaReceiptNumber = callbackMetadata.find(item => item.Name === 'MpesaReceiptNumber').Value;
    const transactionDate = callbackMetadata.find(item => item.Name === 'TransactionDate').Value;
    const phoneNumber = callbackMetadata.find(item => item.Name === 'PhoneNumber').Value;
    
    // Get transaction reference from Account Reference
    const transactionCode = callbackData.Body.stkCallback.AccountReference;
    
    // Update transaction status in database
    const updateResult = await query(
      `UPDATE transactions 
      SET status = ?, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE transaction_code = ?`,
      ['completed', transactionCode]
    );
    
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
      return {
        success: true,
        status: 'COMPLETED',
        message: response.data.ResultDesc
      };
    } else {
      return {
        success: false,
        status: 'FAILED',
        message: response.data.ResultDesc
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