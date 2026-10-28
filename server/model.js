/**
 * A singleton implementation for the database models
 */
const mongoose = require("mongoose");

const config = require("../config");

const Schema = mongoose.Schema;

const userSchema = new Schema({
	username: {
		type: String,
		index: true,
		required: true,
		unique: true,
		match: /^([a-zA-Z0-9]){3,18}$/,
	},
	password: String,
	passwordResetToken: { type: String, index: true },
	passwordResetExpires: Date,
	email: { type: String, index: true, required: true, unique: true },
	emailVerificationCode: { type: String, index: true },
	createdOn: { type: Date, default: Date.now },
	usertype: { type: String, enum: ["free", "paid"], default: "free", required: true },
	updatedOn: Date,
	lastLoginOn: Date,
	lastPostedOn: Date,
	name: String,
	description: String,
	// Legacy favicon URL. New favicons are uploaded and served from /favicon.png (see favicon).
	iconUrl: String,
	// Set once a PNG favicon has been uploaded. updatedOn busts caches when it is replaced.
	favicon: { updatedOn: Date },
	menu: {
		type: [{ name: String, link: String }],
		default: [{ name: "Home", link: "/" }],
	},
	domain: { type: String, index: true, unique: true, sparse: true, lowercase: true },
	theme: { type: String, enum: ["", "sepia", "dark", "nocturne", "forest", "mono", "scribble"], default: "" },
	customStyle: String,
	customScriptUrl: String,
	devices: [{ token: { type: String, index: true }, userAgent: String }],
	deletionDate: { type: Date, expires: 0 },
});

const postSchema = new Schema({
	user: { type: Schema.Types.ObjectId, ref: "Users", index: true },
	type: { type: String, enum: ["post", "page"], default: "post", index: true },
	title: { type: String, required: true },
	slug: { type: String, index: true },
	text: String,
	html: String,
	hashtags: [{ type: String, index: true }],
	createdOn: { type: Date, default: Date.now },
	timezone: String,
	publishedDate: String,
	updatedOn: Date,
});

const bookmarkSchema = new Schema({
	user: { type: Schema.Types.ObjectId, ref: "Users", index: true },
	isPrivate: { type: Boolean, default: false, index: true },
	title: String,
	url: { type: String, required: true },
	notes: String,
	hashtags: [{ type: String, index: true }],
	createdOn: { type: Date, default: Date.now },
	updatedOn: Date,
});

const photoSchema = new Schema({
	user: { type: Schema.Types.ObjectId, ref: "Users", index: true },
	// Private: the S3 location is never sent to the browser, photos are served through /photos/:id.
	s3Key: { type: String, required: true, select: false },
	s3Url: { type: String, required: true, select: false },
	contentType: { type: String, required: true },
	size: { type: Number, required: true },
	createdOn: { type: Date, default: Date.now },
});

const microblogSchema = new Schema({
	user: { type: Schema.Types.ObjectId, ref: "Users", index: true },
	text: String,
	hashtags: [{ type: String, index: true }],
	createdOn: { type: Date, default: Date.now },
	updatedOn: Date,
});

const guestbookEntrySchema = new Schema({
	user: { type: Schema.Types.ObjectId, ref: "Users", index: true },
	name: String,
	email: String,
	text: String,
	// The visitor proved they own the email. Only confirmed entries reach the author.
	isConfirmed: { type: Boolean, default: false },
	isApproved: { type: Boolean, default: false },
	confirmationCode: { type: String, index: true },
	createdOn: { type: Date, default: Date.now },
	// Unconfirmed entries are removed automatically once this date passes.
	expiresOn: { type: Date, expires: 0 },
});

const subscriberSchema = new Schema({
	user: { type: Schema.Types.ObjectId, ref: "Users", index: true },
	email: { type: String, required: true },
	// The visitor proved they own the email. Only confirmed subscribers get new posts.
	isConfirmed: { type: Boolean, default: false },
	confirmationCode: { type: String, index: true },
	// Lives in every email we send, so it only ever unsubscribes this one subscriber.
	unsubscribeToken: { type: String, required: true, index: true },
	createdOn: { type: Date, default: Date.now },
	confirmationSentOn: Date,
	// Unconfirmed subscribers are removed automatically once this date passes.
	expiresOn: { type: Date, expires: 0 },
});
subscriberSchema.index({ user: 1, email: 1 }, { unique: true });

module.exports = (() => {
	let instance;
	let db = mongoose.connection;

	mongoose.set("strictQuery", true);

	const connectToDb = () => {
		mongoose.connect(config.MONGODB_URI);
	};

	const createInstance = () => {
		db.on("error", (error) => {
			console.error("Error in MongoDb connection: ");
			console.error(error);
			mongoose.disconnect(); // Trigger disconnect on any error
		});
		db.on("connected", () => console.log("Veenew DB connected"));
		db.on("disconnected", () => {
			console.log("MongoDB disconnected!");
			connectToDb();
		});

		connectToDb();

		console.log("Veenew DB initialized");

		const Users = mongoose.model("Users", userSchema);
		const Posts = mongoose.model("Posts", postSchema);
		const Bookmarks = mongoose.model("Bookmarks", bookmarkSchema);

		const Photos = mongoose.model("Photos", photoSchema);
		const Microblogs = mongoose.model("Microblogs", microblogSchema);
		const GuestbookEntries = mongoose.model("GuestbookEntries", guestbookEntrySchema);

		const Subscribers = mongoose.model("Subscribers", subscriberSchema);

		return { Posts, Users, Bookmarks, Photos, Microblogs, GuestbookEntries, Subscribers };
	};
	return {
		getInstance: () => {
			if (!instance) {
				instance = createInstance();
			}
			return instance;
		},
	};
})();
