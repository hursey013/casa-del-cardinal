const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const fileMiddleware = require("express-multipart-file-parser");
const tfnode = require("@tensorflow/tfjs-node");
const Twit = require("twit");

const { background, cooldown, knownSpecies, twitter } = require("./config");
const {
  createStatus,
  decodeImage,
  findTopId,
  getLabel,
  getPercentage,
  isNewEvent,
  streamToBase64
} = require("./utils");

const app = express();
app.use(fileMiddleware);

const T = new Twit(twitter);

admin.initializeApp();
const db = admin.database();
const ref = db.ref("events");

const getPredictions = async buffer => {
  const model = await tfnode.loadGraphModel(`file://web_model/model.json`);
  return await model.predict(decodeImage(buffer)).dataSync();
};

const parseResults = predictions => {
  const id = findTopId(predictions);
  return {
    ...getLabel(id),
    score: getPercentage(predictions[id])
  };
};

const postTweet = (buffer, results) =>
  T.post("media/upload", { media_data: streamToBase64(buffer) })
    .then(({ data: { media_id_string } }) =>
      T.post("media/metadata/create", {
        media_id: media_id_string,
        alt_text: {
          text: results.common_name
        }
      }).then(res =>
        T.post("statuses/update", {
          status: createStatus(results),
          media_ids: [media_id_string]
        })
      )
    )
    .catch(error => {
      functions.logger.error("Media upload failed", error);
    });

const saveTimestamp = id => ref.child(id).push(new Date().getTime());

app.post("/", async ({ files }, res) => {
  try {
    const buffer = files[0].buffer;
    const predictions = await getPredictions(buffer);
    const results = parseResults(predictions);
    const snap = await ref.child(results.id).once("value");

    if (results.id !== background && isNewEvent(snap, cooldown)) {
      await Promise.all([
        saveTimestamp(results.id),
        postTweet(buffer, results)
      ]);
    }

    functions.logger.info(results);

    return res.status(200).send(results);
  } catch (error) {
    functions.logger.error(error);

    return res.sendStatus(500);
  }
});

exports.app = functions.https.onRequest(app);
