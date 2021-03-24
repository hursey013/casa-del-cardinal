const fileMiddleware = require("express-multipart-file-parser");
const functions = require("firebase-functions");
const express = require("express");
const tfnode = require("@tensorflow/tfjs-node");
const Twit = require("twit");

require("dotenv").config();

const labels = require("./labels.json");

const imageSize = 224;
const threshold = 33;

const app = express();
app.use(fileMiddleware);

const T = new Twit({
  consumer_key: functions.config().twitter.consumer_key,
  consumer_secret: functions.config().twitter.consumer_secret,
  access_token: functions.config().twitter.access_token,
  access_token_secret: functions.config().twitter.access_token_secret
});

const decodeImage = buffer =>
  resizeImage(
    tfnode.node
      .decodeImage(buffer, 3)
      .cast("float32")
      .div(255)
      .expandDims(0)
  );

const imageToBase64 = stream =>
  Buffer.from(stream, "binary").toString("base64");

const resizeImage = image =>
  tfnode.image.resizeBilinear(image, (size = [imageSize, imageSize]));

const findTopId = predictions => predictions.indexOf(Math.max(...predictions));
const getLabel = id => labels.find(label => label.id === id);
const getPercentage = score => Math.floor(score * 100);

const getPredictions = async buffer => {
  const model = await tfnode.loadGraphModel(`file://web_model/model.json`);

  return await model.predict(await decodeImage(buffer)).dataSync();
};

const postTweet = (media_data, results) =>
  T.post("media/upload", { media_data })
    .then(({ data }) =>
      T.post("media/metadata/create", {
        media_id: data.media_id_string,
        alt_text: {
          text: results.common_name
        }
      }).then(res =>
        T.post("statuses/update", {
          status: `Spotted a ${results.common_name.toLowerCase()} at the bird feeder!`,
          media_ids: [data.media_id_string]
        })
      )
    )
    .catch(error => {
      console.error("Media upload failed");
    });

app.post("/", async (req, res) => {
  const { buffer } = req.files[0];
  const predictions = await getPredictions(buffer);
  const id = findTopId(predictions);
  const label = getLabel(id);
  const score = getPercentage(predictions[id]);
  const results = { ...label, score };

  if (score >= threshold && label.id !== 964) {
    postTweet(imageToBase64(buffer), results);
  }

  functions.logger.info(results);

  return res.status(200).send(results);
});

exports.app = functions.https.onRequest(app);
// app.listen(3000, () => console.log("App listening on port 3000!"));
