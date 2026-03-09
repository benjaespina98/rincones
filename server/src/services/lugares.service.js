const Lugar = require("../models/lugar.model");

const getAllLugares = async () => {
  return Lugar.find().sort({ creadoEn: -1 });
};

const getLugarById = async (id) => {
  return Lugar.findById(id);
};

const createLugar = async (payload) => {
  return Lugar.create(payload);
};

const updateLugarById = async (id, payload) => {
  return Lugar.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });
};

const deleteLugarById = async (id) => {
  return Lugar.findByIdAndDelete(id);
};

module.exports = {
  getAllLugares,
  getLugarById,
  createLugar,
  updateLugarById,
  deleteLugarById,
};
