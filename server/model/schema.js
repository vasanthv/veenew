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
	hideFromDirectory: Boolean,
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
	deletionDate: { type: Date, expires: 0 },
});

const postSchema = new Schema({
	user: { type: Schema.Types.ObjectId, ref: "Users", index: true },
	type: { type: String, enum: ["post", "page"], default: "post", index: true },
	text: String,
	html: String,
	slug: { type: String, default: "", index: true },
	hashtags: [{ type: String, index: true }],
	createdOn: { type: Date, default: Date.now },
	updatedOn: Date,
	deletionDate: { type: Date, expires: 0 },
});

module.exports = {
	userSchema,
	postSchema,
};
