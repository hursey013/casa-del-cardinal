const functions = require("firebase-functions");
require("dotenv").config();

module.exports = {
  knownSpecies: [
    68, // northern cardinal
    909, // Carolina wren,
    441, // mourning dove
    658, // Carolina chickadee
    3, // blue jay
    648, // tufted titmouse
    484, // American robin
    182, // red-bellied woodpecker
    730, // American goldfinch,
    130, // downy woodpecker
    650, // song sparrow
    890, // northern mockingbird
    807, // white-breasted nuthatch
    354, // eastern bluebird
    91, // white-throated sparrow
    320, // house finch
    147 // common grackle
  ],
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
