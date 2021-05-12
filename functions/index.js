const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios").default;
const express = require("express");
const tfnode = require("@tensorflow/tfjs-node");
const Twit = require("twit");

const { background, cooldown, known, threshold, twitter } = require("./config");
const {
  bufferToBase64,
  createStatus,
  cropImage,
  decodeImage,
  findTopId,
  getLabel,
  getPercentage,
  isNewEvent
} = require("./utils");

const app = express(express.json());

const T = new Twit(twitter);

admin.initializeApp();
const db = admin.database();
const ref = db.ref("events");

const getBuffer = url =>
  axios
    .get(url, {
      responseType: "arraybuffer"
    })
    .then(res => res.data);

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

const postTweet = async (cropped, original, results) => {
  const media = await Promise.all([
    T.post("media/upload", { media_data: bufferToBase64(cropped) }),
    T.post("media/upload", { media_data: bufferToBase64(original) })
  ]);

  await Promise.all([
    T.post("media/metadata/create", {
      media_id: media[0].data.media_id_string,
      alt_text: {
        text: `Cropped photo of a ${results.common_name}`
      }
    }),
    T.post("media/metadata/create", {
      media_id: media[1].data.media_id_string,
      alt_text: {
        text: `Full size photo of a ${results.common_name}`
      }
    })
  ]);

  return await T.post("statuses/update", {
    status: createStatus(results),
    media_ids: [media[0].data.media_id_string, media[1].data.media_id_string]
  });
};

const saveTimestamp = id => ref.child(id).push(new Date().getTime());

app.post("/", async ({ body: { region, url } }, res) => {
  if (url) {
    try {
      const original = await getBuffer(url);
      const cropped = await cropImage(original, region);
      const predictions = await getPredictions(cropped);
      const results = parseResults(predictions);
      const snap = await ref.child(results.id).once("value");

      functions.logger.info(results);
      await saveTimestamp(results.id);

      if (
        results.id !== background &&
        isNewEvent(snap, cooldown) &&
        (known.includes(results.id) || results.score >= threshold * 2)
      ) {
        await postTweet(cropped, original, results);
      }

      return res.status(200).send(results);
    } catch (error) {
      functions.logger.error(error);

      return res.sendStatus(500);
    }
  }
  return res.sendStatus(500);
});

exports.app = functions.https.onRequest(app);
