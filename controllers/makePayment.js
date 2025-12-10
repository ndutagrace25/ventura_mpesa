const axios = require("axios");
const { cleanPhone } = require("../utils/cleanPhone");
const generateTimestamp = require("../utils/generateTimestamp");
require("dotenv").config();

// Cache for M-Pesa configs to avoid repeated API calls
const configCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch M-Pesa config from backend API
 * @param {number|null} configId - Optional config ID, uses default if not provided
 * @returns {Promise<Object>} M-Pesa configuration with credentials
 */
const fetchMpesaConfig = async (configId = null) => {
  const cacheKey = configId ? `config_${configId}` : "config_default";
  const cached = configCache.get(cacheKey);

  // Return cached config if still valid
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log("Using cached M-Pesa config:", cacheKey);
    return cached.data;
  }

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

    // Cache the config
    configCache.set(cacheKey, {
      data: config,
      timestamp: Date.now(),
    });

    console.log("Fetched M-Pesa config:", config.name);
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
  const { phone, amount, billNumber, mpesaConfigId } = req.body;
  let PhoneNumber = cleanPhone(phone).substring(1);

  console.log(`${process.env.VALIDATE_BILL_URL}?billNumber=${billNumber}`);

  // Validate bill number before initiating STK Push
  let billData;
  try {
    const validateResponse = await axios.get(
      `${process.env.VALIDATE_BILL_URL}?billNumber=${billNumber}`
    );

    if (!validateResponse.data.success) {
      return res.status(400).json({
        success: false,
        error: validateResponse.data.error || "Bill validation failed",
        code: validateResponse.data.code,
      });
    }

    billData = validateResponse.data.data;
    console.log("Bill validated successfully:", billData);
  } catch (error) {
    console.log(
      "Bill validation error:",
      error.response?.data || error.message
    );

    // Return the specific error from validation endpoint
    if (error.response?.data) {
      return res.status(error.response.status || 400).json({
        success: false,
        error: error.response.data.error || "Bill validation failed",
        code: error.response.data.code || "VALIDATION_ERROR",
      });
    }

    return res.status(400).json({
      success: false,
      error: "Failed to validate bill. Please try again.",
      code: "VALIDATION_ERROR",
    });
  }

  // Determine which M-Pesa config to use:
  // 1. mpesaConfigId from request body
  // 2. mpesaConfigId from bill data
  // 3. Config fetched in middleware (req.mpesaConfig)
  // 4. Default from env vars
  const effectiveConfigId = mpesaConfigId || billData.mpesaConfigId;

  // Get M-Pesa config and credentials
  let shortcode, passkey, partyB, callbackUrl, configName;

  if (req.mpesaConfig) {
    // Use config from middleware
    shortcode = req.mpesaConfig.shortcode;
    passkey = req.mpesaConfig.passkey;
    partyB = req.mpesaConfig.partyB;
    callbackUrl = req.mpesaConfig.callbackUrl || process.env.CALLBACK;
    configName = req.mpesaConfig.name;
  } else if (effectiveConfigId) {
    // Fetch specific config
    try {
      const config = await fetchMpesaConfig(effectiveConfigId);
      shortcode = config.shortcode;
      passkey = config.passkey;
      partyB = config.partyB;
      callbackUrl = config.callbackUrl || process.env.CALLBACK;
      configName = config.name;

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
  } else {
    // Use env vars (legacy)
    shortcode = process.env.SHORTCODE;
    passkey = process.env.PASSKEY;
    partyB = process.env.PARTYB;
    callbackUrl = process.env.CALLBACK;
    configName = "Legacy (env vars)";
  }

  // Determine transaction type based on config type
  const transactionType = "CustomerPayBillOnline"; // For PayBill

  // Build callback URL with billNumber and mpesaConfigId
  let finalCallbackUrl = `${callbackUrl}/?billNumber=${billNumber}`;
  if (effectiveConfigId) {
    finalCallbackUrl += `&mpesaConfigId=${effectiveConfigId}`;
  }

  console.log("Initiating STK Push with config:", configName);
  console.log("Callback URL:", finalCallbackUrl);

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
        AccountReference: billNumber,
        TransactionDesc: "Bill Payment",
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

/**
 * Clear the config cache (useful for testing or when configs are updated)
 */
const clearConfigCache = () => {
  configCache.clear();
  console.log("M-Pesa config cache cleared");
};

module.exports = {
  initiateStkPush,
  generateToken,
  validate,
  fetchMpesaConfig,
  clearConfigCache,
};
