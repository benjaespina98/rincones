const mongoose = require("mongoose");
const lugaresService = require("../services/lugares.service");
const ChangeLog = require("../models/changeLog.model");

const compactForLog = (lugar) => {
  if (!lugar) {
    return null;
  }

  const base = typeof lugar.toObject === "function" ? lugar.toObject() : lugar;
  const imagenes = Array.isArray(base.imagenes) ? base.imagenes : [];

  return {
    _id: String(base._id || ""),
    nombre: base.nombre,
    descripcion: base.descripcion,
    categoria: base.categoria,
    ciudad: base.ciudad,
    direccion: base.direccion,
    ubicacion: base.ubicacion,
    contacto: base.contacto,
    rating: base.rating,
    imagenesCount: imagenes.length,
    creadoEn: base.creadoEn,
  };
};

const registerChangeLog = async ({ req, action, lugarId, before, after }) => {
  if (!req.user) {
    return;
  }

  await ChangeLog.create({
    lugarId,
    action,
    actor: {
      userId: req.user.id,
      email: req.user.email,
      role: req.user.role,
    },
    before: compactForLog(before),
    after: compactForLog(after),
  });
};

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

    await registerChangeLog({
      req,
      action: "create",
      lugarId: nuevoLugar._id,
      before: null,
      after: nuevoLugar,
    });

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

    const lugarAntes = await lugaresService.getLugarById(id);

    if (!lugarAntes) {
      return res.status(404).json({ message: "Lugar no encontrado" });
    }

    const lugarActualizado = await lugaresService.updateLugarById(id, req.body);

    if (!lugarActualizado) {
      return res.status(404).json({ message: "Lugar no encontrado" });
    }

    await registerChangeLog({
      req,
      action: "update",
      lugarId: lugarActualizado._id,
      before: lugarAntes,
      after: lugarActualizado,
    });

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

    const lugarAntes = await lugaresService.getLugarById(id);

    if (!lugarAntes) {
      return res.status(404).json({ message: "Lugar no encontrado" });
    }

    const lugarEliminado = await lugaresService.deleteLugarById(id);

    if (!lugarEliminado) {
      return res.status(404).json({ message: "Lugar no encontrado" });
    }

    await registerChangeLog({
      req,
      action: "delete",
      lugarId: lugarEliminado._id,
      before: lugarAntes,
      after: null,
    });

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
