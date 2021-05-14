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
  decodeImage,
  isValidEvent,
  parseResults
} = require("./utils");

const app = express(express.json());
const T = new Twit(twitter);
admin.initializeApp();
const db = admin.database();
const ref = db.ref("events");

const downloadFile = async eventId => {
  const writer = fs.createWriteStream(filePath);

  const response = await axios({
    method: "GET",
    url: `${apiUrl}/${eventId}/feeder/clip.mp4`,
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

const downloadImage = eventId =>
  axios
    .get(`${apiUrl}/${eventId}/snapshot.jpg?crop=1`, {
      responseType: "arraybuffer"
    })
    .then(res => res.data);

const getPredictions = async buffer => {
  const model = await tfnode.loadGraphModel(`file://web_model/model.json`);

  return model.predict(decodeImage(buffer)).dataSync();
};

const postTweet = async (payload, buffer, results) => {
  let media_id_string;

  if (Math.random() < 0.5) {
    const video = await downloadFile(payload.id);
    ({ media_id_string } = await uploadVideo(video, buffer));
  } else {
    ({
      data: { media_id_string }
    } = await uploadImage(buffer));
  }

  await new Promise(resolve => setTimeout(resolve, 10000));

  return T.post("statuses/update", {
    status: createStatus(results),
    media_ids: [media_id_string]
  });
};

const uploadImage = buffer =>
  T.post("media/upload", {
    media_data: bufferToBase64(buffer)
  });

const uploadVideo = (filePath, buffer) =>
  new Promise((resolve, reject) => {
    T.postMediaChunked({ file_path: filePath }, async (err, data, response) => {
      if (!err) {
        resolve(data);
      } else {
        const data = await uploadImage(buffer);

        functions.logger.error(err);
        resolve(data);
      }
    });
  });

const saveTimestamp = id => ref.child(id).push(new Date().getTime());

app.post("/", async ({ body: { after: payload } }, res) => {
  try {
    const buffer = await downloadImage(payload.id);
    const predictions = await getPredictions(buffer);
    const results = parseResults(predictions);
    const snap = await ref.child(results.id).once("value");

    functions.logger.info(results);
    saveTimestamp(results.id); // Save timestamp to RDB

    if (isValidEvent(results, snap)) {
      await postTweet(payload, buffer, results); // Send tweet
    }

    return res.sendStatus(200);
  } catch (error) {
    functions.logger.error(error);

    return res.sendStatus(500);
  }
});

exports.app = functions.runWith(runtimeOpts).https.onRequest(app);
