/**
 * Fixed values shared by the server code
 */
module.exports = {
	PASSWORD_RESET_TTL_MS: 60 * 60 * 1000, // 1 hour
	PASSWORD_RESET_COOLDOWN_MS: 2 * 60 * 1000, // at most one email per account every 2 mins

	GUESTBOOK_CONFIRM_TTL_MS: 24 * 60 * 60 * 1000, // 1 day
	GUESTBOOK_COOLDOWN_MS: 5 * 60 * 1000, // at most one confirmation email per address and blog every 5 mins

	SUBSCRIPTION_CONFIRM_TTL_MS: 24 * 60 * 60 * 1000, // 1 day
	SUBSCRIPTION_COOLDOWN_MS: 5 * 60 * 1000, // at most one confirmation email per address and blog every 5 mins

	// What a new blog starts with. The author can edit or delete all of it.
	STARTER_HOME_PAGE_TEXT: `## Welcome to my corner of the web

Hi, I'm so glad you stopped by. This is my little space on the internet where I write about the things I'm learning, making and thinking about. Pull up a chair, have a look around, and say hello in the [guestbook](/guestbook) before you go.

## Blog

{{posts.all}}`,
	STARTER_POST_TITLE: "Hello, world!",
	STARTER_POST_TEXT: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

This is a sample post. Edit or delete it from your Posts page any time. #hello #welcome`,
	STARTER_ABOUT_PAGE_TEXT: `Hello! I'm a curious person who loves making small things and writing about them. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec odio praesent libero, sed cursus ante dapibus diam.

When I'm not writing, you'll find me out for a long walk, trying a new recipe or getting lost in a good book. Sed nisi nulla quis sem at nibh elementum imperdiet. Duis sagittis ipsum, praesent mauris.

## Stay in touch

Get an email whenever I publish a new post. No spam, and you can unsubscribe any time.

{{subscription.form}}`,
	STARTER_GUESTBOOK_PAGE_TEXT: `## Sign my guestbook

I'd love to hear from you. Leave a note to say hello, share what you liked or just let me know you were here. Your email is never shown, and your message appears below once I approve it.

{{guestbook.form}}

## Messages

{{guestbook.entries.approved}}`,
	STARTER_MENU: [
		{ name: "Home", link: "/" },
		{ name: "About", link: "/about" },
	],
};
