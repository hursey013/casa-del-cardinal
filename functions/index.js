const functions = require("firebase-functions");
const express = require("express");
const tfnode = require("@tensorflow/tfjs-node");
const Jimp = require("jimp");

const labels = require("./labels.json");

const height = 224;
const width = 224;
const threshold = 0.33;

const app = express();
app.use(express.json());

const decodeImage = async base64str => {
  const imageBuffer = Buffer.from(base64str, "base64");
  const image = await Jimp.read(imageBuffer);
  image.cover(
    height,
    width,
    Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_MIDDLE
  );
  const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);

  return tfnode.node
    .decodeImage(buffer, 3)
    .cast("float32")
    .div(255)
    .expandDims(0);
};

const getPredictions = async imagePath => {
  const image = await decodeImage(imagePath);
  const model = await tfnode.loadGraphModel(`file://web_model/model.json`);
  const predictions = await model.predict(image).dataSync();

  return predictions;
};

const getIndex = predictions => predictions.indexOf(Math.max(...predictions));
const getLabel = index => labels.find(label => label.id === index);

app.post("/", async ({ body: { image } }, res) => {
  if (image) {
    const predictions = await getPredictions(image);
    const index = getIndex(predictions);
    const label = getLabel(index);
    const score = predictions[index];

    if (score >= threshold && label.id !== 964) {
      const results = { ...label, score: Math.floor(score * 100) };

      functions.logger.info(results);

      return res.status(200).send(results);
    }
  }

  return res.status(200).send({});
});

exports.app = functions.https.onRequest(app);
// app.listen(3000, () => console.log("App listening on port 3000!"));
