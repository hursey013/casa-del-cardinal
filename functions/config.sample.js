const functions = require("firebase-functions");

module.exports = {
  apiUrl: "https://homeassistant.myserver.com", // Public URL to Home Assitant
  background: 964,
  cooldown: 5, // How many minutes to wait before reposting same species
  filePath: "/tmp/video.mp4",
  imageSize: 224,
  known: [
    3, // blue jay
    68, // northern cardinal
    91, // white-throated sparrow
    130, // downy woodpecker
    147, // common grackle
    182, // red-bellied woodpecker
    320, // house finch
    345, // eastern bluebird
    441, // mourning dove
    484, // American robin
    648, // tufted titmouse
    650, // song sparrow
    658, // Carolina chickadee
    730, // American goldfinch,
    807, // white-breasted nuthatch
    890, // northern mockingbird
    909 // Carolina wren
  ],
  runtimeOpts: {
    timeoutSeconds: 300
  },
  threshold: 66, // If not known, score must be above this threshold to be valid
  twitter: {
    consumer_key: functions.config().twitter.consumer_key,
    consumer_secret: functions.config().twitter.consumer_secret,
    access_token: functions.config().twitter.access_token,
    access_token_secret: functions.config().twitter.access_token_secret
  }
};
