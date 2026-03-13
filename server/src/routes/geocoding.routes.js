const { Router } = require("express");
const geocodingController = require("../controllers/geocoding.controller");

const router = Router();

router.get("/", geocodingController.getCoordinates);
router.get("/reverse", geocodingController.getReverseCoordinates);
router.get("/discover", geocodingController.discoverPlaces);
router.post("/chat", geocodingController.askDiscoverAssistant);

module.exports = router;
