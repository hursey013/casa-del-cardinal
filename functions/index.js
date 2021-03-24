const a = require("indefinite");
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

const addArticle = string => a(string);

const createStatus = ({ common_name, id, score }) => {
  let status = "";

  if (id !== 964) {
    status =
      score >= threshold
        ? `Fairly certain ${addArticle(common_name)}`
        : `Could be wrong, but what might be ${addArticle(common_name)}`;
  } else {
    status = "Can't make out the species, but this bird";
  }

  return (status += " was just spotted at the feeder!");
};

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
          status: createStatus(results),
          media_ids: [data.media_id_string]
        })
      )
    )
    .catch(error => {
      functions.logger.error("Media upload failed");
    });

app.post("/", async (req, res) => {
  const { buffer } = req.files[0];
  const predictions = await getPredictions(buffer);
  const id = findTopId(predictions);
  const label = getLabel(id);
  const score = getPercentage(predictions[id]);
  const results = { ...label, score };

  postTweet(imageToBase64(buffer), results);

  return res.status(200).send(results);
});

// exports.app = functions.https.onRequest(app);
app.listen(3000, () => console.log("App listening on port 3000!"));
