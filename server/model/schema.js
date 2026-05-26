const { Schema } = require("mongoose");

const userSchema = new Schema({
	username: {
		type: String,
		index: true,
		required: true,
		unique: true,
		match: /^([a-zA-Z0-9]){3,18}$/,
	},
	password: String,
	email: { type: String, index: true, required: true, unique: true },
	emailVerificationCode: { type: String, index: true },
	createdOn: { type: Date, default: Date.now },
	usertype: { type: String, enum: ["free", "paid"], default: "free", required: true },
	updatedOn: Date,
	lastLoginOn: Date,
	lastPostedOn: Date,
	name: String,
	iconUrl: String,
	bio: String,
	bioHTML: String,
	menu: {
		type: [{ name: String, link: String }],
		default: [{ name: "Home", link: "/" }],
	},
	nav: { type: String, default: "[Home](/)" },
	navHTML: {
		type: String,
		default: '<a href="/">Home</a>',
	},
	domain: String,
	customStyle: String,
	customScriptUrl: String,
	devices: [{ token: { type: String, index: true }, userAgent: String }],
	publicKey: String,
	privateKey: String,
	follows: [
		{
			remoteUser: { type: Schema.Types.ObjectId, ref: "RemoteUsers", index: true },
			since: { type: Date, default: Date.now },
			accepted: { type: Boolean, default: false },
		},
	],
	followers: [
		{
			remoteUser: { type: Schema.Types.ObjectId, ref: "RemoteUsers", index: true },
			since: { type: Date, default: Date.now },
		},
	],
	deletionDate: { type: Date, expires: 0 },
});

const postSchema = new Schema({
	user: { type: Schema.Types.ObjectId, ref: "Users", index: true },
	type: { type: String, enum: ["post", "page"], default: "post", index: true },
	text: String,
	html: String,
	slug: { type: String, default: "" },
	hashtags: [{ type: String, index: true }],
	createdOn: { type: Date, default: Date.now },
	updatedOn: Date,
	deletionDate: { type: Date, expires: 0 },
});

const remoteUserSchema = new Schema({
	actorUrl: { type: String, index: true, unique: true, required: true },
	username: String,
	domain: String,
	handle: { type: String, index: true },
	name: String,
	iconUrl: String,
	summary: String,
	inboxUrl: String,
	sharedInboxUrl: String,
	outboxUrl: String,
	followersUrl: String,
	followingUrl: String,
	publicKey: String,
	publicKeyId: String,
	discoveredOn: { type: Date, default: Date.now },
	lastFetchedOn: Date,
});

const remotePostSchema = new Schema({
	remoteUser: { type: Schema.Types.ObjectId, ref: "RemoteUsers", index: true, required: true },
	activityPubId: { type: String, index: true, unique: true, required: true },
	url: String,
	content: String,
	imageUrls: [String],
	createdOn: { type: Date, default: Date.now, index: true },
	updatedOn: Date,
});

module.exports = {
	userSchema,
	postSchema,
	remoteUserSchema,
	remotePostSchema,
};
