const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth.middleware");
const Wine = require("../models/wine.model");
const WineMoment = require("../models/wineMoment.model");
const User = require("../models/user.model");

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const parseQuantity = (value, fallback = 1) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const toWineStatus = ({ tasted, quantity, status }) => {
  if (typeof status === "string" && status.trim()) {
    return status.trim();
  }

  if (Number(quantity) <= 0) {
    return tasted ? "archived" : "stock";
  }

  return tasted ? "tasted" : "stock";
};

// Obtener todos los vinos del usuario actual
router.get("/", authenticate, async (req, res) => {
  try {
    const wines = await Wine.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .select("-rawText"); // Excluir texto OCR para reducir tamaño

    res.json({
      success: true,
      data: wines,
      count: wines.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Buscar vinos del usuario actual
router.get("/search", authenticate, async (req, res) => {
  try {
    const query = String(req.query.q || req.query.query || "").trim();

    if (!query) {
      return res.json({ success: true, data: [], count: 0 });
    }

    const safeQuery = escapeRegex(query);
    const regex = new RegExp(safeQuery, "i");

    const wines = await Wine.find({
      userId: req.user.id,
      $or: [
        { name: regex },
        { winery: regex },
        { region: regex },
        { varietal: regex },
        { notes: regex },
      ],
    })
      .sort({ createdAt: -1 })
      .select("-rawText");

    res.json({
      success: true,
      data: wines,
      count: wines.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener estadísticas
router.get("/stats/summary", authenticate, async (req, res) => {
  try {
    const wines = await Wine.find({ userId: req.user.id });

    const avgRating = wines.length > 0 
      ? (wines.reduce((sum, w) => sum + w.rating, 0) / wines.length).toFixed(1)
      : 0;

    res.json({
      success: true,
      data: {
        totalWines: wines.length,
        tastedWines: wines.filter((w) => w.tasted).length,
        favoriteWines: wines.filter((w) => w.favorite).length,
        stockWines: wines.filter((w) => Number(w.quantity) > 0).length,
        averageRating: parseFloat(avgRating),
        byRating: {
          5: wines.filter((w) => w.rating === 5).length,
          4: wines.filter((w) => w.rating === 4).length,
          3: wines.filter((w) => w.rating === 3).length,
          2: wines.filter((w) => w.rating === 2).length,
          1: wines.filter((w) => w.rating === 1).length,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener un vino específico
router.get("/:id", authenticate, async (req, res) => {
  try {
    const wine = await Wine.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!wine) {
      return res.status(404).json({ success: false, error: "Vino no encontrado" });
    }

    res.json({ success: true, data: wine });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Crear un nuevo vino
router.post("/", authenticate, async (req, res) => {
  try {
    const {
      name,
      winery,
      vintage,
      region,
      varietal,
      notes,
      image,
      rawText,
      rating,
      tasted,
      favorite,
      quantity,
      status,
      lastConsumedAt,
      consumptionCount,
    } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ success: false, error: "El nombre del vino es obligatorio" });
    }

    const wine = new Wine({
      userId: req.user.id,
      name: name.trim(),
      winery: winery?.trim() || "",
      vintage: vintage ? parseInt(vintage) : null,
      region: region?.trim() || "",
      varietal: varietal?.trim() || "",
      notes: notes?.trim() || "",
      image: image || "",
      rawText: rawText || "",
      rating: rating ? parseInt(rating) : 0,
      tasted: tasted === true,
      favorite: favorite === true,
      quantity: parseQuantity(quantity, 1),
      status: toWineStatus({ tasted: tasted === true, quantity: parseQuantity(quantity, 1), status }),
      lastConsumedAt: lastConsumedAt ? new Date(lastConsumedAt) : undefined,
      consumptionCount: parseQuantity(consumptionCount, 0),
    });

    const savedWine = await wine.save();

    // Actualizar estadísticas del usuario
    const user = await User.findById(req.user.id);
    user.stats.winesCount = (user.stats.winesCount || 0) + 1;
    if (tasted) user.stats.tastedWines = (user.stats.tastedWines || 0) + 1;
    await user.save();

    res.status(201).json({ success: true, data: savedWine });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar un vino
router.put("/:id", authenticate, async (req, res) => {
  try {
    const wine = await Wine.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!wine) {
      return res.status(404).json({ success: false, error: "Vino no encontrado" });
    }

    const {
      name,
      winery,
      vintage,
      region,
      varietal,
      notes,
      rating,
      tasted,
      favorite,
      quantity,
      status,
      lastConsumedAt,
      consumptionCount,
    } = req.body;

    if (name !== undefined) wine.name = name.trim();
    if (winery !== undefined) wine.winery = winery.trim();
    if (vintage !== undefined) wine.vintage = vintage ? parseInt(vintage) : null;
    if (region !== undefined) wine.region = region.trim();
    if (varietal !== undefined) wine.varietal = varietal.trim();
    if (notes !== undefined) wine.notes = notes.trim();
    if (rating !== undefined) wine.rating = parseInt(rating);
    if (favorite !== undefined) wine.favorite = favorite === true;
    if (quantity !== undefined) wine.quantity = parseQuantity(quantity, wine.quantity);
    if (status !== undefined) wine.status = toWineStatus({ tasted: wine.tasted, quantity: wine.quantity, status });
    if (lastConsumedAt !== undefined) wine.lastConsumedAt = lastConsumedAt ? new Date(lastConsumedAt) : null;
    if (consumptionCount !== undefined) wine.consumptionCount = parseQuantity(consumptionCount, wine.consumptionCount || 0);

    // Actualizar estado "tasted"
    const wasTasted = wine.tasted;
    if (tasted !== undefined) wine.tasted = tasted === true;
    wine.status = toWineStatus({ tasted: wine.tasted, quantity: wine.quantity, status: wine.status });

    wine.updatedAt = new Date();
    const updatedWine = await wine.save();

    // Actualizar estadísticas del usuario
    if (wasTasted !== updatedWine.tasted) {
      const user = await User.findById(req.user.id);
      if (updatedWine.tasted) {
        user.stats.tastedWines = (user.stats.tastedWines || 0) + 1;
      } else {
        user.stats.tastedWines = Math.max(0, (user.stats.tastedWines || 0) - 1);
      }
      await user.save();
    }

    res.json({ success: true, data: updatedWine });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ajustar stock de un vino
router.patch("/:id/stock", authenticate, async (req, res) => {
  try {
    const { delta, quantity } = req.body;

    const wine = await Wine.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!wine) {
      return res.status(404).json({ success: false, error: "Vino no encontrado" });
    }

    const nextQuantity = quantity !== undefined
      ? parseQuantity(quantity, wine.quantity)
      : Math.max(0, Number(wine.quantity || 0) + Number(delta || 0));

    wine.quantity = nextQuantity;
    wine.status = toWineStatus({ tasted: wine.tasted, quantity: nextQuantity, status: wine.status });
    wine.updatedAt = new Date();

    const updatedWine = await wine.save();

    res.json({ success: true, data: updatedWine });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener momentos de consumo de un vino
router.get("/:id/moments", authenticate, async (req, res) => {
  try {
    const wine = await Wine.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!wine) {
      return res.status(404).json({ success: false, error: "Vino no encontrado" });
    }

    const moments = await WineMoment.find({
      wineId: wine._id,
      userId: req.user.id,
    }).sort({ consumedAt: -1 });

    res.json({ success: true, data: moments, count: moments.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Registrar un momento de consumo
router.post("/:id/moments", authenticate, async (req, res) => {
  try {
    const wine = await Wine.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!wine) {
      return res.status(404).json({ success: false, error: "Vino no encontrado" });
    }

    const moment = await WineMoment.create({
      userId: req.user.id,
      wineId: wine._id,
      consumedAt: req.body.consumedAt ? new Date(req.body.consumedAt) : new Date(),
      occasion: String(req.body.occasion || "").trim(),
      companions: String(req.body.companions || "").trim(),
      place: String(req.body.place || "").trim(),
      emotion: String(req.body.emotion || "").trim(),
      foodPairing: String(req.body.foodPairing || "").trim(),
      notes: String(req.body.notes || "").trim(),
      rating: req.body.rating !== undefined ? Number(req.body.rating) : wine.rating,
      photo: String(req.body.photo || "").trim(),
      tags: Array.isArray(req.body.tags) ? req.body.tags.filter(Boolean).map((tag) => String(tag).trim()) : [],
    });

    const wasTasted = wine.tasted;
    wine.consumptionCount = Number(wine.consumptionCount || 0) + 1;
    wine.lastConsumedAt = moment.consumedAt;
    wine.tasted = true;
    wine.status = toWineStatus({ tasted: true, quantity: wine.quantity, status: wine.status });
    await wine.save();

    if (!wasTasted) {
      const user = await User.findById(req.user.id);
      user.stats.tastedWines = (user.stats.tastedWines || 0) + 1;
      await user.save();
    }

    res.status(201).json({ success: true, data: moment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar un vino
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const wine = await Wine.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!wine) {
      return res.status(404).json({ success: false, error: "Vino no encontrado" });
    }

    // Actualizar estadísticas del usuario
    const user = await User.findById(req.user.id);
    user.stats.winesCount = Math.max(0, (user.stats.winesCount || 0) - 1);
    if (wine.tasted) {
      user.stats.tastedWines = Math.max(0, (user.stats.tastedWines || 0) - 1);
    }
    await user.save();

    await Wine.deleteOne({ _id: req.params.id, userId: req.user.id });

    res.json({ success: true, message: "Vino eliminado" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
