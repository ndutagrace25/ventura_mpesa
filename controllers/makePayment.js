const axios = require("axios");
const { cleanPhone } = require("../utils/cleanPhone");
const generateTimestamp = require("../utils/generateTimestamp");
require("dotenv").config();

/**
 * Fetch M-Pesa config from backend API (no caching - configs rarely change)
 * @param {number|null} configId - Optional config ID, uses default if not provided
 * @returns {Promise<Object>} M-Pesa configuration with credentials
 */
const fetchMpesaConfig = async (configId = null) => {
  try {
    const endpoint = configId
      ? `${process.env.BACKEND_URL}/api/internal/mpesa-config/${configId}`
      : `${process.env.BACKEND_URL}/api/internal/mpesa-config/default`;

    console.log("Fetching M-Pesa config from:", endpoint);

    const response = await axios.get(endpoint, {
      headers: {
        "X-API-Key": process.env.INTERNAL_API_KEY,
      },
    });

    if (!response.data.success) {
      throw new Error(response.data.message || "Failed to fetch M-Pesa config");
    }

    const config = response.data.data;
    console.log("Fetched M-Pesa config:", config.name, "type:", config.type);
    return config;
  } catch (error) {
    console.error(
      "Error fetching M-Pesa config:",
      error.response?.data || error.message
    );
    throw new Error(
      error.response?.data?.message || "Failed to fetch M-Pesa configuration"
    );
  }
};

/**
 * Generate access token using M-Pesa config credentials
 * @param {Object} config - M-Pesa configuration object
 * @returns {Promise<string>} Access token
 */
const generateAccessToken = async (config) => {
  try {
    const {
      data: { access_token },
    } = await axios({
      method: "GET",
      url: process.env.ACCESS_TOKEN_URL,
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            config.consumerKey + ":" + config.consumerSecret
          ).toString("base64"),
        Accept: "application/json",
      },
    });

    console.log(access_token, "ACCESS TOKEN");

    return access_token;
  } catch (error) {
    console.error("Error generating access token:", error.message);
    throw new Error("Failed to generate M-Pesa access token");
  }
};

// middleware function to generate token (legacy - uses env vars)
const generateToken = async (req, res, next) => {
  try {
    // Check if mpesaConfigId is provided, if so fetch config from backend
    const { mpesaConfigId } = req.body;

    console.log(mpesaConfigId, "MPESA CONFIG ID");

    if (mpesaConfigId || process.env.BACKEND_URL) {
      // Use dynamic config from backend
      try {
        const config = await fetchMpesaConfig(mpesaConfigId);
        const accessToken = await generateAccessToken(config);
        req.mpesaConfig = config;
        req.mpesaToken = accessToken;
        console.log("Using dynamic M-Pesa config:", config.name);
        return next();
      } catch (configError) {
        console.error("Failed to fetch dynamic config:", configError.message);
        // Fall back to env vars if backend is not available
        if (!process.env.CUSTOMER_KEY || !process.env.CUSTOMER_SECRET) {
          return res.status(500).json({
            success: false,
            error: "M-Pesa configuration not available",
          });
        }
        console.log("Falling back to environment variables for M-Pesa config");
      }
    }

    // Legacy: Use environment variables
    const {
      data: { access_token },
    } = await axios({
      method: "GET",
      url: process.env.ACCESS_TOKEN_URL,
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.CUSTOMER_KEY + ":" + process.env.CUSTOMER_SECRET
          ).toString("base64"),
        Accept: "application/json",
      },
    });
    console.log(access_token, "ACCESS TOKEN");
    req.mpesaToken = access_token;
    console.log("Using legacy M-Pesa config from env vars");
    next();
  } catch (e) {
    console.log(e.message, "generate token error");
    res.status(400).json({ error: e.message });
  }
};

// initiate the stk push
const initiateStkPush = async (req, res, next) => {
  const {
    phone,
    amount,
    billNumber,
    mpesaConfigId,
    functionCode,
    reservationNumber,
    billNumbers,
  } = req.body;
  let PhoneNumber = cleanPhone(phone).substring(1);

  console.log(
    `${process.env.VALIDATE_BILL_URL}?billNumber=${billNumber}&functionCode=${functionCode}&reservationNumber=${reservationNumber}`
  );

  // Validate bill number before initiating STK Push
  let billData;
  let isMultipleBills = false;
  let validBillNumbers = [];

  try {
    let validateResponse = null;

    if (billNumbers && Array.isArray(billNumbers) && billNumbers.length > 0) {
      // Multiple bills validation
      isMultipleBills = true;
      validateResponse = await axios.post(
        `${process.env.VALIDATE_MULTIPLE_BILLS_URL}`,
        { billNumbers }
      );

      if (!validateResponse.data.success) {
        return res.status(400).json({
          success: false,
          error:
            validateResponse.data.message || "Some bills failed validation",
          code: "MULTIPLE_BILLS_VALIDATION_FAILED",
          results: validateResponse.data.results,
        });
      }

      // Extract valid bill numbers for the callback URL
      validBillNumbers = validateResponse.data.validBills.map(
        (b) => b.billNumber
      );
      billData = {
        totalAmount: validateResponse.data.summary.totalAmount,
        mpesaConfigId: validateResponse.data.validBills[0]?.mpesaConfigId,
      };
      console.log(
        "Multiple bills validated successfully:",
        validateResponse.data.summary
      );
    } else {
      // Single bill/function/reservation validation
      validateResponse = await axios.get(
        `${process.env.VALIDATE_BILL_URL}?billNumber=${billNumber}&functionCode=${functionCode}&reservationNumber=${reservationNumber}`
      );

      if (!validateResponse.data.success) {
        return res.status(400).json({
          success: false,
          error:
            validateResponse.data.error ||
            `${
              functionCode
                ? "Function booking"
                : reservationNumber
                ? "Reservation"
                : "Bill"
            } validation failed`,
          code: validateResponse.data.code,
        });
      }

      billData = validateResponse.data.data;
      console.log("Bill validated successfully:", billData);
    }
  } catch (error) {
    console.log(
      `${
        isMultipleBills
          ? "Multiple bills"
          : functionCode
          ? "Function booking"
          : reservationNumber
          ? "Reservation"
          : "Bill"
      } validation error:`,
      error.response?.data || error.message
    );

    // Return the specific error from validation endpoint
    if (error.response?.data) {
      return res.status(error.response.status || 400).json({
        success: false,
        error:
          error.response.data.error ||
          `${
            isMultipleBills
              ? "Multiple bills"
              : functionCode
              ? "Function booking"
              : reservationNumber
              ? "Reservation"
              : "Bill"
          } validation failed`,
        code: error.response.data.code || "VALIDATION_ERROR",
      });
    }

    return res.status(400).json({
      success: false,
      error: `Failed to validate ${
        isMultipleBills
          ? "bills"
          : functionCode
          ? "function booking"
          : reservationNumber
          ? "reservation"
          : "bill"
      }. Please try again.`,
      code: "VALIDATION_ERROR",
    });
  }

  // Determine which M-Pesa config to use:
  // 1. mpesaConfigId from bill data (takes precedence - bill knows which config to use)
  // 2. mpesaConfigId from request body
  // 3. Config fetched in middleware (req.mpesaConfig) - only if ID matches
  // 4. Default from env vars
  const effectiveConfigId = billData.mpesaConfigId || mpesaConfigId;

  console.log(
    "Effective Config ID:",
    effectiveConfigId,
    "| Middleware Config ID:",
    req.mpesaConfig?.id
  );

  // Get M-Pesa config and credentials
  let shortcode, passkey, partyB, callbackUrl, configName, configType;

  // Use middleware config ONLY if its ID matches the effective config ID
  // Otherwise, fetch the correct config based on effectiveConfigId
  if (req.mpesaConfig && req.mpesaConfig.id === effectiveConfigId) {
    // Use config from middleware (IDs match)
    shortcode = req.mpesaConfig.shortcode;
    passkey = req.mpesaConfig.passkey;
    partyB = req.mpesaConfig.partyB;
    callbackUrl = req.mpesaConfig.callbackUrl || process.env.CALLBACK;
    configName = req.mpesaConfig.name;
    configType = req.mpesaConfig.type; // 'paybill' or 'till'
    console.log("Using middleware config (ID matched):", configName);
  } else if (effectiveConfigId) {
    // Fetch the specific config for this payment
    try {
      const config = await fetchMpesaConfig(effectiveConfigId);

      console.log(
        "Fetched specific config:",
        config.name,
        "ID:",
        config.id,
        "Type:",
        config.type
      );
      shortcode = config.shortcode;
      passkey = config.passkey;
      partyB = config.partyB;
      callbackUrl = config.callbackUrl || process.env.CALLBACK;
      configName = config.name;
      configType = config.type; // 'paybill' or 'till'

      // Generate token for this specific config
      req.mpesaToken = await generateAccessToken(config);
    } catch (configError) {
      console.error("Failed to fetch M-Pesa config:", configError.message);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch M-Pesa configuration",
        code: "CONFIG_ERROR",
      });
    }
  } else if (req.mpesaConfig) {
    // No specific config ID, use whatever middleware fetched (default)
    shortcode = req.mpesaConfig.shortcode;
    passkey = req.mpesaConfig.passkey;
    partyB = req.mpesaConfig.partyB;
    callbackUrl = req.mpesaConfig.callbackUrl || process.env.CALLBACK;
    configName = req.mpesaConfig.name;
    configType = req.mpesaConfig.type;
    console.log("Using middleware default config:", configName);
  } else {
    // Use env vars (legacy)
    shortcode = process.env.SHORTCODE;
    passkey = process.env.PASSKEY;
    partyB = process.env.PARTYB;
    callbackUrl = process.env.CALLBACK;
    configName = "Legacy (env vars)";
    configType = "paybill"; // Legacy defaults to paybill
    console.log("Using legacy env vars config");
  }

  // Determine transaction type based on config type
  // PayBill uses "CustomerPayBillOnline", Till uses "CustomerBuyGoodsOnline"
  const transactionType =
    configType === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";

  console.log(
    "Using transaction type:",
    transactionType,
    "for config type:",
    configType
  );

  // Build callback URL with the appropriate reference (billNumber, functionCode, reservationNumber, or billNumbers)
  let finalCallbackUrl = callbackUrl;
  let accountReference;

  if (isMultipleBills && validBillNumbers.length > 0) {
    // Multiple bills - pass as comma-separated billNumbers param
    finalCallbackUrl += `?billNumbers=${validBillNumbers.join(",")}`;
    accountReference = validBillNumbers.join(",");
  } else if (functionCode) {
    finalCallbackUrl += `?functionCode=${functionCode}`;
    accountReference = functionCode;
  } else if (reservationNumber) {
    finalCallbackUrl += `?reservationNumber=${reservationNumber}`;
    accountReference = reservationNumber;
  } else if (billNumber) {
    finalCallbackUrl += `?billNumber=${billNumber}`;
    accountReference = billNumber;
  }

  if (effectiveConfigId) {
    finalCallbackUrl += `&mpesaConfigId=${effectiveConfigId}`;
  }

  console.log("Initiating STK Push with config:", configName);
  console.log("Callback URL:", finalCallbackUrl);
  console.log("Account Reference:", accountReference);

  // Bill is valid, proceed with STK Push
  await axios
    .post(
      process.env.STK_PUSH_URL,
      {
        BusinessShortCode: shortcode,
        Password: Buffer.from(
          shortcode + passkey + generateTimestamp()
        ).toString("base64"),
        Timestamp: generateTimestamp(),
        TransactionType: transactionType,
        Amount: amount,
        PartyA: PhoneNumber,
        PartyB: partyB,
        PhoneNumber: PhoneNumber,
        CallBackURL: finalCallbackUrl,
        AccountReference: accountReference,
        TransactionDesc: isMultipleBills
          ? "Multiple Bills Payment"
          : "Bill Payment",
      },
      {
        headers: {
          Authorization: `Bearer ${req.mpesaToken}`,
        },
      }
    )
    .then(async (response) => {
      res.status(200).json({
        ...response.data,
        mpesaConfigId: effectiveConfigId,
        mpesaConfigName: configName,
        isMultipleBills,
        billCount: isMultipleBills ? validBillNumbers.length : 1,
        billNumbers: isMultipleBills ? validBillNumbers : undefined,
      });
    })
    .catch((error) => {
      console.log(error.response?.data || error.message, "STK Push error");
      res.status(400).json(error.response?.data || { error: error.message });
    });
};

const validate = (req, res) => {
  return res.status(200).json("success");
};

module.exports = {
  initiateStkPush,
  generateToken,
  validate,
  fetchMpesaConfig,
};
