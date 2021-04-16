const dayjs = require("dayjs");
const rosaenlgPug = require("rosaenlg");
const tfnode = require("@tensorflow/tfjs-node");

const { imageSize, threshold } = require("./config");
const labels = require("./labels.json");

const createStatus = results =>
  rosaenlgPug.renderFile("status.pug", {
    language: "en_US",
    results,
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

const streamToBase64 = stream =>
  Buffer.from(stream, "binary").toString("base64");

const resizeImage = image =>
  tfnode.image.resizeBilinear(image, (size = [imageSize, imageSize]));

const findTopId = predictions => predictions.indexOf(Math.max(...predictions));
const getLabel = id => labels.find(label => label.id === id);
const getPercentage = score => Math.floor(score * 100);

module.exports = {
  createStatus,
  decodeImage,
  findTopId,
  getLabel,
  getPercentage,
  isNewEvent,
  streamToBase64
};
