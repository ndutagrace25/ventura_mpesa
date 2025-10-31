const express = require("express");
const { makePaymentController } = require("../controllers");
const router = express.Router();

// make payment
router.post(
  "/",
  makePaymentController.generateToken,
  makePaymentController.initiateStkPush
);
router.post("/validate", makePaymentController.validate);

module.exports = router;
