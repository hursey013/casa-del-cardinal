const dayjs = require("dayjs");
const rosaenlgPug = require("rosaenlg");
const tfnode = require("@tensorflow/tfjs-node");

const {
  background,
  cooldown,
  imageSize,
  known,
  threshold
} = require("./config");
const labels = require("./labels.json");

const bufferToBase64 = buffer =>
  Buffer.from(buffer, "binary").toString("base64");

const createStatus = (results, snap) =>
  rosaenlgPug.renderFile("status.pug", {
    language: "en_US",
    known: known.includes(results.id),
    now: new Date().getHours(),
    results,
    snap,
    threshold
  });

const decodeImage = buffer =>
  resizeImage(
    tfnode.node
      .decodeImage(buffer, 3)
      .cast("float32")
      .div(255)
      .expandDims(0)
  );

const isNewEvent = (snap, cooldown) => {
  const timestamps = snap.val();

  return (
    !snap.exists() ||
    !timestamps ||
    dayjs(
      timestamps[Object.keys(timestamps)[Object.keys(timestamps).length - 1]]
    ).isBefore(dayjs().subtract(cooldown, "minutes"))
  );
};

const isValidEvent = (results, snap) =>
  results.id !== background &&
  isNewEvent(snap, cooldown) &&
  (known.includes(results.id) || results.score >= threshold * 2);

const resizeImage = image =>
  tfnode.image.resizeBilinear(image, (size = [imageSize, imageSize]));

const findTopId = predictions => predictions.indexOf(Math.max(...predictions));
const getLabel = id => labels.find(label => label.id === id);
const getPercentage = score => Math.floor(score * 100);

const parseResults = predictions => {
  const id = findTopId(predictions);

  return {
    ...getLabel(id),
    score: getPercentage(predictions[id])
  };
};

module.exports = {
  bufferToBase64,
  createStatus,
  decodeImage,
  isValidEvent,
  parseResults
};
