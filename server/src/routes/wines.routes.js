const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth.middleware");
const Wine = require("../models/wine.model");
const User = require("../models/user.model");

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
    const { name, winery, vintage, region, varietal, notes, image, rawText, rating, tasted } = req.body;

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

    const { name, winery, vintage, region, varietal, notes, rating, tasted } = req.body;

    if (name !== undefined) wine.name = name.trim();
    if (winery !== undefined) wine.winery = winery.trim();
    if (vintage !== undefined) wine.vintage = vintage ? parseInt(vintage) : null;
    if (region !== undefined) wine.region = region.trim();
    if (varietal !== undefined) wine.varietal = varietal.trim();
    if (notes !== undefined) wine.notes = notes.trim();
    if (rating !== undefined) wine.rating = parseInt(rating);

    // Actualizar estado "tasted"
    const wasTasted = wine.tasted;
    if (tasted !== undefined) wine.tasted = tasted === true;

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

// Obtener estadísticas
router.get("/stats/summary", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const wines = await Wine.find({ userId: req.user.id });

    const avgRating = wines.length > 0 
      ? (wines.reduce((sum, w) => sum + w.rating, 0) / wines.length).toFixed(1)
      : 0;

    res.json({
      success: true,
      data: {
        totalWines: wines.length,
        tastedWines: wines.filter((w) => w.tasted).length,
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

module.exports = router;
