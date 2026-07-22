const js = require("@eslint/js");
const globals = require("globals");
const prettier = require("eslint-config-prettier");

module.exports = [
	{
		ignores: ["node_modules/**", "coverage/**", ".nyc_output/**", "dist/**"],
	},

	js.configs.recommended,

	{
		// Server code: CommonJS on Node.
		files: ["**/*.js"],
		languageOptions: {
			ecmaVersion: 2023,
			sourceType: "commonjs",
			globals: {
				...globals.node,
			},
		},
	},

	{
		// Browser bundle served to the client. `App` is created here and read by
		// the inline scripts in views/*.ejs, so it is not unused.
		files: ["assets/**/*.js"],
		languageOptions: {
			sourceType: "script",
			globals: {
				...globals.browser,
			},
		},
		rules: {
			"no-unused-vars": ["error", { varsIgnorePattern: "^(App|redirect)$" }],
		},
	},

	// Must stay last: switches off rules that would fight Prettier.
	prettier,
];
