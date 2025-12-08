const axios = require("axios");
const { cleanPhone } = require("../utils/cleanPhone");
const generateTimestamp = require("../utils/generateTimestamp");
require("dotenv").config();

// middleware function to generate token.
const generateToken = async (req, res, next) => {
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
            process.env.CUSTOMER_KEY + ":" + process.env.CUSTOMER_SECRET
          ).toString("base64"),
        Accept: "application/json",
      },
    });

    // console.log(expires_in, "token")
    token = access_token;

    console.log(token, "token");
    next();
  } catch (e) {
    console.log(e.message, "generate token error");
    res.status(400).json({ error: e });
  }
};

// initiate the stk push
const initiateStkPush = async (req, res, next) => {
  const { phone, amount, billNumber } = req.body;
  let PhoneNumber = cleanPhone(phone).substring(1);

  console.log(`${process.env.VALIDATE_BILL_URL}?billNumber=${billNumber}`);

  // Validate bill number before initiating STK Push
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

    console.log("Bill validated successfully:", validateResponse.data.data);
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

  // Bill is valid, proceed with STK Push
  await axios
    .post(
      process.env.STK_PUSH_URL,
      {
        BusinessShortCode: process.env.SHORTCODE,
        Password: Buffer.from(
          process.env.SHORTCODE + process.env.PASSKEY + generateTimestamp()
        ).toString("base64"),
        Timestamp: generateTimestamp(),
        TransactionType: "CustomerPayBillOnline", //if paybill is CustomerPayBillOnline
        Amount: amount,
        PartyA: PhoneNumber,
        PartyB: process.env.PARTYB, //you can use shortcode for the paybill
        PhoneNumber: PhoneNumber,
        CallBackURL: process.env.CALLBACK + `/?billNumber=${billNumber}`,
        AccountReference: billNumber,
        TransactionDesc: "Bill Payment",
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )
    .then(async (response) => {
      res.status(200).json(response.data);
    })
    .catch((error) => {
      console.log(error.response.data, "error");
      res.status(400).json(error.response.data);
    });
};

const validate = (req, res) => {
  return res.status(200).json("success");
};

module.exports = {
  initiateStkPush,
  generateToken,
  validate,
};
