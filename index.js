const express = require("express");
const app = express();

require("dotenv").config();

const cors = require("cors");

const { makePaymentRoutes } = require("./routes");

const port = process.env.RUNNING_PORT || "5003";

app.listen(port, () => {
  console.log(`App running on localhost: ${port}`);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// initiate routes
app.use("/pay", makePaymentRoutes);
