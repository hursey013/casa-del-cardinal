const functions = require("firebase-functions");

const admin = require("firebase-admin");
const axios = require("axios").default;
const express = require("express");
const fs = require("fs");
const tfnode = require("@tensorflow/tfjs-node");
const Twit = require("twit");

const { apiUrl, filePath, runtimeOpts, twitter } = require("./config");
const {
  bufferToBase64,
  createStatus,
  cropImage,
  decodeImage,
  isValidEvent,
  parseResults
} = require("./utils");

const app = express(express.json());
const T = new Twit(twitter);
admin.initializeApp();
const db = admin.database();
const ref = db.ref("events");

const downloadImage = eventId =>
  axios
    .get(`${apiUrl}/${eventId}/snapshot.jpg`, {
      responseType: "arraybuffer"
    })
    .then(res => res.data);

const downloadVideo = async eventId => {
  const writer = fs.createWriteStream(filePath);
  const response = await axios.get(`${apiUrl}/${eventId}/feeder/clip.mp4`, {
    responseType: "stream"
  });

  return new Promise((resolve, reject) => {
    const data = response.data.pipe(writer);
    let error = null;

    writer.on("error", err => {
      error = err;
      writer.close();
      reject(err);
    });

    writer.on("close", () => {
      if (!error) {
        resolve(filePath);
      }
    });
  });
};

const getPredictions = async buffer => {
  const model = await tfnode.loadGraphModel(`file://web_model/model.json`);

  return model.predict(decodeImage(buffer)).dataSync();
};

const postTweet = async (payload, original, cropped, results) => {
  const randomImage = Math.random() < 0.5 ? original : cropped;
  let media_id_string;

  if (Math.random() < 0.5) {
    try {
      const video = await downloadVideo(payload.id);

      ({ media_id_string } = await uploadVideo(video));

      await new Promise(resolve => setTimeout(resolve, 1000 * 5));
    } catch (err) {
      media_id_string = await uploadImage(randomImage, results);
    }
  } else {
    media_id_string = await uploadImage(randomImage, results);
  }

  return T.post("statuses/update", {
    status: createStatus(results),
    media_ids: [media_id_string]
  });
};

const uploadImage = async (buffer, results) => {
  const {
    data: { media_id_string }
  } = await T.post("media/upload", {
    media_data: bufferToBase64(buffer)
  });

  await T.post("media/metadata/create", {
    media_id: media_id_string,
    alt_text: {
      text: `Photo of a ${results.common_name}`
    }
  });

  return media_id_string;
};

const uploadVideo = async (filePath, buffer) => {
  return new Promise((resolve, reject) => {
    try {
      T.postMediaChunked({ file_path: filePath }, (error, data, response) => {
        if (!error) {
          try {
            resolve(data);
          } catch (error) {
            functions.logger.error(error);
            reject(error);
          }
        } else {
          reject(error);
        }
      });
    } catch (error) {
      functions.logger.error(error);
      reject(error);
    }
  });
};

const saveTimestamp = id => ref.child(id).push(new Date().getTime());

app.post("/", async ({ body: { after: payload } }, res) => {
  try {
    const original = await downloadImage(payload.id);
    const cropped = await cropImage(original, payload.region);
    const predictions = await getPredictions(cropped);
    const results = parseResults(predictions);
    const snap = await ref.child(results.id).once("value");

    functions.logger.info(results);

    saveTimestamp(results.id); // Save timestamp to RDB

    if (isValidEvent(results, snap)) {
      await postTweet(payload, original, cropped, results); // Send tweet
    }

    return res.sendStatus(200);
  } catch (error) {
    functions.logger.error(error);

    return res.sendStatus(500);
  }
});

exports.app = functions.runWith(runtimeOpts).https.onRequest(app);
