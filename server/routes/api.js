const router = require("express").Router();
const bodyParser = require("body-parser");
const multer = require("multer");

const apiHandler = require("../controllers");
const { rateLimit, isUserAuthed } = require("../middlewares");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: false }));

router.get("/verify/:code", apiHandler.verifyEmail);

router.post("/signup", rateLimit({ windowMs: 60, max: 2, skipFailedRequests: true }), apiHandler.signUp);
router.post("/login", rateLimit({ max: 5 }), apiHandler.logIn);
router.post("/reset", rateLimit({ max: 5 }), apiHandler.resetPassword);
router.post("/resend", rateLimit({ max: 1 }), apiHandler.resendEmailVerification);

router.use(isUserAuthed);

router.put("/account", apiHandler.updateAccount);
router.post("/logout", apiHandler.logOut);
router.delete("/account", apiHandler.deleteAccount);

router.post("/posts", rateLimit({ max: 5 }), apiHandler.createPost);
router.put("/posts/:id", apiHandler.updatePost);
router.delete("/posts/:id", apiHandler.deletePost);
router.post("/pages", rateLimit({ max: 5 }), apiHandler.createPage);
router.put("/pages/:id", apiHandler.updatePage);
router.delete("/pages/:id", apiHandler.deletePage);

router.post("/import", upload.single("file"), apiHandler.importPosts);

/**
 * API endpoints common error handling middleware
 */
router.use(["/:404", "/"], (req, res) => {
	res.status(404).json({ message: "ROUTE_NOT_FOUND" });
});

// Handle the known errors
router.use((err, req, res, next) => {
	if (err.httpErrorCode) {
		res.status(err.httpErrorCode).json({ message: err.message || "Something went wrong" });
	} else {
		next(err);
	}
});

// Handle the unknown errors
// eslint-disable-next-line
router.use((err, req, res, next) => {
	console.error(err);
	res.status(500).json({ message: "Something went wrong", error: err.message });
});

module.exports = router;
