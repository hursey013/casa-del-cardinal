const functions = require("firebase-functions");
require("dotenv").config();

module.exports = {
  background: 964,
  imageSize: 224,
  threshold: 33,
  twitter: {
    consumer_key: functions.config().twitter.consumer_key,
    consumer_secret: functions.config().twitter.consumer_secret,
    access_token: functions.config().twitter.access_token,
    access_token_secret: functions.config().twitter.access_token_secret
  }
};
