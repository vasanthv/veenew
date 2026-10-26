const router = require("express").Router();
const bodyParser = require("body-parser");
const multer = require("multer");

const config = require("../../config");
const apiHandler = require("../controllers");
const { rateLimit, isUserAuthed, isUserAdmin } = require("../middlewares");

// One photo per request, anything over the size limit is rejected while streaming.
const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.PHOTO_MAX_BYTES, files: 1 } });
const uploadSinglePhoto = (req, res, next) =>
	photoUpload.single("photo")(req, res, (error) => {
		if (!error) return next();
		if (error.code === "LIMIT_FILE_SIZE") return next(Object.assign(new Error("Photo must be 1MB or smaller"), { httpErrorCode: 400 }));
		if (error instanceof multer.MulterError) return next(Object.assign(new Error("Upload one photo at a time"), { httpErrorCode: 400 }));
		next(error);
	});

const faviconUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.FAVICON_MAX_BYTES, files: 1 } });
const uploadSingleFavicon = (req, res, next) =>
	faviconUpload.single("favicon")(req, res, (error) => {
		if (!error) return next();
		if (error.code === "LIMIT_FILE_SIZE") return next(Object.assign(new Error("Favicon must be 512KB or smaller"), { httpErrorCode: 400 }));
		if (error instanceof multer.MulterError) return next(Object.assign(new Error("Upload one favicon at a time"), { httpErrorCode: 400 }));
		next(error);
	});

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: false }));

router.post("/verify/:code", rateLimit({ max: 10 }), apiHandler.verifyEmail);

router.post("/signup", rateLimit({ windowMs: 60, max: 2, skipFailedRequests: true }), apiHandler.signUp);
router.post("/login", rateLimit({ max: 5 }), apiHandler.logIn);
router.post("/reset", rateLimit({ max: 5 }), apiHandler.resetPassword);
router.post("/reset/:token", rateLimit({ max: 5 }), apiHandler.completePasswordReset);
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

router.post("/bookmarks", rateLimit({ max: 60 }), apiHandler.createBookmark);
router.put("/bookmarks/:id", rateLimit({ max: 60 }), apiHandler.updateBookmark);
router.delete("/bookmarks/:id", apiHandler.deleteBookmark);

router.post("/microblogs", rateLimit({ max: 60 }), apiHandler.createMicroblog);
router.put("/microblogs/:id", rateLimit({ max: 60 }), apiHandler.updateMicroblog);
router.delete("/microblogs/:id", apiHandler.deleteMicroblog);

router.put("/guestbook/:id", rateLimit({ max: 60 }), apiHandler.updateGuestbookEntry);
router.delete("/guestbook/:id", apiHandler.deleteGuestbookEntry);

router.delete("/subscribers/:id", apiHandler.deleteSubscriber);

router.post("/photos", rateLimit({ max: 60 }), uploadSinglePhoto, apiHandler.uploadPhoto);
router.delete("/photos/:id", apiHandler.deletePhoto);

router.post("/favicon", rateLimit({ max: 20 }), uploadSingleFavicon, apiHandler.uploadFavicon);
router.delete("/favicon", apiHandler.deleteFavicon);

router.post("/newsletter", isUserAdmin, rateLimit({ max: 10 }), apiHandler.sendNewsletter);

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
