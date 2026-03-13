const express = require("express");
const placesController = require("../controllers/places.controller");

const router = express.Router();

router.get("/", placesController.getPlaces);

module.exports = router;