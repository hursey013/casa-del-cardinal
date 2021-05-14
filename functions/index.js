const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios").default;
const express = require("express");
const fs = require("fs");
const tfnode = require("@tensorflow/tfjs-node");
const Twit = require("twit");

const {
  background,
  cooldown,
  filePath,
  known,
  runtimeOpts,
  threshold,
  twitter
} = require("./config");
const {
  bufferToBase64,
  createStatus,
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

const downloadFile = async eventId => {
  const writer = fs.createWriteStream(filePath);

  const response = await axios({
    method: "GET",
    url: `https://homeassistant.bhurst.me/api/frigate/notifications/${eventId}/feeder/clip.mp4`,
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

const getBuffer = eventId =>
  axios
    .get(
      `https://homeassistant.bhurst.me/api/frigate/notifications/${eventId}/snapshot.jpg?crop=1`,
      {
        responseType: "arraybuffer"
      }
    )
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

const postTweet = async (payload, image, results) => {
  let media_id_string;

  if (payload.end_time - payload.start_time <= 30) {
    const video = await downloadFile(payload.id);
    ({ media_id_string, processing_info } = await uploadVideo(video));
  } else {
    ({
      data: { media_id_string }
    } = await T.post("media/upload", { media_data: bufferToBase64(image) }));

    await T.post("media/metadata/create", {
      media_id: media_id_string,
      alt_text: {
        text: `Photo of a ${results.common_name}`
      }
    });
  }

  if (processing_info) {
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  return await T.post("statuses/update", {
    status: createStatus(results),
    media_ids: [media_id_string]
  });
};

const uploadVideo = filePath =>
  new Promise((resolve, reject) => {
    T.postMediaChunked({ file_path: filePath }, (err, data, response) => {
      if (!err) {
        try {
          resolve(data);
        } catch (err) {
          console.error(err);
          reject(err);
        }
      } else {
        reject(err);
      }
    });
  });

const saveTimestamp = id => ref.child(id).push(new Date().getTime());

app.post("/", async ({ body: { payload } }, res) => {
  try {
    const image = await getBuffer(payload.id);
    const predictions = await getPredictions(image);
    const results = parseResults(predictions);
    const snap = await ref.child(results.id).once("value");

    functions.logger.info(results);
    await saveTimestamp(results.id);

    if (
      results.id !== background &&
      isNewEvent(snap, cooldown) &&
      (known.includes(results.id) || results.score >= threshold * 2)
    ) {
      await postTweet(payload, image, results);
    }

    return res.status(200).send(results);
  } catch (error) {
    functions.logger.error(error);

    return res.sendStatus(500);
  }
});

exports.app = functions.runWith(runtimeOpts).https.onRequest(app);
