const router = require("express").Router();
const bodyParser = require("body-parser");
const multer = require("multer");

const config = require("../../config");
const apiHandler = require("../controllers");
const { rateLimit, isUserAuthed, isEmailVerified, isUserAdmin } = require("../middlewares");

/**
 * Builds middleware that accepts one uploaded file in the given form field. Anything over the size limit
 * is rejected while streaming, and failures become 400 errors the API error handler can report.
 */
const uploadSingle = (field, maxBytes, limitMessage) => {
	const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1 } });
	const badRequest = (message) => Object.assign(new Error(message), { httpErrorCode: 400 });
	return (req, res, next) =>
		upload.single(field)(req, res, (error) => {
			if (!error) return next();
			if (error.code === "LIMIT_FILE_SIZE") return next(badRequest(limitMessage));
			if (error instanceof multer.MulterError) return next(badRequest(`Upload one ${field} at a time`));
			next(error);
		});
};
const uploadSinglePhoto = uploadSingle("photo", config.PHOTO_MAX_BYTES, "Photo must be 1MB or smaller");
const uploadSingleFavicon = uploadSingle("favicon", config.FAVICON_MAX_BYTES, "Favicon must be 512KB or smaller");

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

router.post("/posts", isEmailVerified, rateLimit({ max: 5 }), apiHandler.createPost);
router.put("/posts/:id", isEmailVerified, apiHandler.updatePost);
router.post("/posts/:id/notify", isEmailVerified, rateLimit({ max: 5 }), apiHandler.notifyPostSubscribers);
router.delete("/posts/:id", apiHandler.deletePost);
router.post("/pages", isEmailVerified, rateLimit({ max: 5 }), apiHandler.createPage);
router.put("/pages/:id", isEmailVerified, apiHandler.updatePage);
router.delete("/pages/:id", apiHandler.deletePage);

router.post("/bookmarks", isEmailVerified, rateLimit({ max: 60 }), apiHandler.createBookmark);
router.put("/bookmarks/:id", isEmailVerified, rateLimit({ max: 60 }), apiHandler.updateBookmark);
router.delete("/bookmarks/:id", apiHandler.deleteBookmark);

router.post("/microblogs", isEmailVerified, rateLimit({ max: 60 }), apiHandler.createMicroblog);
router.put("/microblogs/:id", isEmailVerified, rateLimit({ max: 60 }), apiHandler.updateMicroblog);
router.delete("/microblogs/:id", apiHandler.deleteMicroblog);

router.put("/guestbook/:id", rateLimit({ max: 60 }), apiHandler.updateGuestbookEntry);
router.delete("/guestbook/:id", apiHandler.deleteGuestbookEntry);

router.delete("/subscribers/:id", apiHandler.deleteSubscriber);

router.post("/photos", isEmailVerified, rateLimit({ max: 60 }), uploadSinglePhoto, apiHandler.uploadPhoto);
router.delete("/photos/:id", apiHandler.deletePhoto);

router.post("/favicon", rateLimit({ max: 20 }), uploadSingleFavicon, apiHandler.uploadFavicon);
router.delete("/favicon", apiHandler.deleteFavicon);

router.post("/newsletter", isUserAdmin, rateLimit({ max: 10 }), apiHandler.sendNewsletter);

router.get("/admin/blogs", isUserAdmin, rateLimit({ max: 120 }), apiHandler.adminListBlogs);
router.delete("/admin/blogs/:id", isUserAdmin, rateLimit({ max: 30 }), apiHandler.adminDeleteBlog);
router.delete("/admin/blogs/:id/domain", isUserAdmin, rateLimit({ max: 30 }), apiHandler.adminDeleteDomain);

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
	res.status(500).json({ message: "Something went wrong" });
});

module.exports = router;
