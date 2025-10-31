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
  const { phone, amount, meter_number, customer_id, meter_id } = req.body;
  let PhoneNumber = cleanPhone(phone).substring(1);

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
        CallBackURL:
          process.env.CALLBACK +
          `/?meter_number=${meter_number}&customer_id=${customer_id}&meter_id=${meter_id}`,
        AccountReference: meter_number,
        TransactionDesc: "Simaxis Account",
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
