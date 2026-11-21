const wishesService = require("../services/wishes.service");
const { fail } = require("../utils/apiError");
const { validarVino } = require("../utils/validarVino");

const list = async (req, res) => {
  try {
    const wishes = await wishesService.listWishes(req.user.id);
    return res.json({ success: true, data: wishes, count: wishes.length });
  } catch (error) {
    return fail(res, error, req);
  }
};

const create = async (req, res) => {
  try {
    const invalido = validarVino(req.body);
    if (invalido) return res.status(400).json({ success: false, error: invalido });
    const wish = await wishesService.createWish(req.user.id, req.body);
    return res.status(201).json({ success: true, data: wish });
  } catch (error) {
    return fail(res, error, req);
  }
};

const update = async (req, res) => {
  try {
    const wish = await wishesService.updateWish(req.user.id, req.params.id, req.body);
    if (!wish) return res.status(404).json({ success: false, error: "Vino no encontrado en la lista" });
    return res.json({ success: true, data: wish });
  } catch (error) {
    return fail(res, error, req);
  }
};

const remove = async (req, res) => {
  try {
    const ok = await wishesService.deleteWish(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: "Vino no encontrado en la lista" });
    return res.json({ success: true, message: "Eliminado de la lista de deseos" });
  } catch (error) {
    return fail(res, error, req);
  }
};

module.exports = { list, create, update, remove };
