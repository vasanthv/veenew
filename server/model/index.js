/**
 * A singleton implemetaion for the database models
 */
const mongoose = require("mongoose");

const config = require("../../config");
const { userSchema, postSchema } = require("./schema");

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

		return { Posts, Users };
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
