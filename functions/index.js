const fileMiddleware = require("express-multipart-file-parser");
const functions = require("firebase-functions");
const express = require("express");
const tfnode = require("@tensorflow/tfjs-node");
const Twit = require("twit");

const { twitter } = require("./config");
const {
  createStatus,
  decodeImage,
  findTopId,
  getLabel,
  getPercentage,
  streamToBase64
} = require("./utils");

const app = express();
app.use(fileMiddleware);

const T = new Twit(twitter);

const getPredictions = async buffer =>
  await tfnode
    .loadGraphModel(`file://web_model/model.json`)
    .predict(decodeImage(buffer))
    .dataSync();

const parseResults = predictions => {
  const id = findTopId(predictions);

  return {
    ...getLabel(id),
    score: getPercentage(predictions[id])
  };
};

const postTweet = (buffer, { common_name, id, score }) =>
  T.post("media/upload", { media_data: streamToBase64(buffer) })
    .then(({ data: { media_id_string } }) =>
      T.post("media/metadata/create", {
        media_id: media_id_string,
        alt_text: {
          text: common_name
        }
      }).then(res =>
        T.post("statuses/update", {
          status: createStatus({ common_name, id, score }),
          media_ids: [media_id_string]
        })
      )
    )
    .catch(error => {
      functions.logger.error("Media upload failed", error);
    });

app.post("/", async ({ files }, res) => {
  const buffer = files[0].buffer;
  const predictions = await getPredictions(buffer);
  const results = parseResults(predictions);

  postTweet(buffer, results);

  return res.status(200).send(results);
});

exports.app = functions.https.onRequest(app);
