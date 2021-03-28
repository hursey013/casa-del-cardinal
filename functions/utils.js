const a = require("indefinite");
const rosaenlgPug = require("rosaenlg");
const tfnode = require("@tensorflow/tfjs-node");

const { imageSize, threshold } = require("./config");
const labels = require("./labels.json");

const createStatus = bird =>
  rosaenlgPug.renderFile("status.pug", {
    language: "en_US",
    bird
  });

const decodeImage = buffer =>
  resizeImage(
    tfnode.node
      .decodeImage(buffer, 3)
      .cast("float32")
      .div(255)
      .expandDims(0)
  );

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
  streamToBase64
};
