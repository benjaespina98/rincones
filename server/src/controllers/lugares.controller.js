const mongoose = require("mongoose");
const lugaresService = require("../services/lugares.service");

const getAllLugares = async (req, res, next) => {
  try {
    const lugares = await lugaresService.getAllLugares();
    res.status(200).json({ data: lugares });
  } catch (error) {
    next(error);
  }
};

const getLugarById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID de lugar invalido" });
    }

    const lugar = await lugaresService.getLugarById(id);

    if (!lugar) {
      return res.status(404).json({ message: "Lugar no encontrado" });
    }

    res.status(200).json({ data: lugar });
  } catch (error) {
    next(error);
  }
};

const createLugar = async (req, res, next) => {
  try {
    const nuevoLugar = await lugaresService.createLugar(req.body);
    res.status(201).json({ data: nuevoLugar });
  } catch (error) {
    next(error);
  }
};

const updateLugarById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID de lugar invalido" });
    }

    const lugarActualizado = await lugaresService.updateLugarById(id, req.body);

    if (!lugarActualizado) {
      return res.status(404).json({ message: "Lugar no encontrado" });
    }

    res.status(200).json({ data: lugarActualizado });
  } catch (error) {
    next(error);
  }
};

const deleteLugarById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "ID de lugar invalido" });
    }

    const lugarEliminado = await lugaresService.deleteLugarById(id);

    if (!lugarEliminado) {
      return res.status(404).json({ message: "Lugar no encontrado" });
    }

    res.status(200).json({ message: "Lugar eliminado correctamente" });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllLugares,
  getLugarById,
  createLugar,
  updateLugarById,
  deleteLugarById,
};
