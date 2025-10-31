const axios = require("axios");
require("dotenv/config");

const savePayment = async (payment) => {
  try {
    await axios.post(process.env.SAVE_PAYMENT_URL, payment);
  } catch (error) {
    console.log(error);
  }
};

module.exports =  savePayment;
