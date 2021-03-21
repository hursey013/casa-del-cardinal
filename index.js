const tfnode = require("@tensorflow/tfjs-node");
const Jimp = require("jimp");
const labels = require("./labels.json");

const height = 224;
const width = 224;
const threshold = 0.33;

const decodeImage = async imagePath => {
  const image = await Jimp.read(imagePath);
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

const predict = async imagePath => {
  const predictions = await getPredictions(imagePath);
  const index = getIndex(predictions);
  const label = getLabel(index);
  const score = predictions[index];

  if (score >= threshold && label.id !== 964) {
    const results = { ...label, score: Math.floor(score * 100) };

    console.log(results);

    return results;
  }

  return false;
};

if (process.argv.length !== 3)
  throw new Error("Usage: node index.js <image-file>");

predict(process.argv[2]);
