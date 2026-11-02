const { marked } = require("marked");

// Markdown to html converter initialization
const renderer = new marked.Renderer();

// Prevent nested links
/**
 * Renders markdown links with safe external-link attributes.
 * @param {string|object} href - Link href or marked token.
 * @param {string} [title] - Link title.
 * @param {string} [text] - Link label text.
 * @returns {string} HTML anchor markup or fallback text.
 */
renderer.link = function (href, title, text) {
	const token = typeof href === "object" && href !== null ? href : null;
	const resolvedHref = token ? token.href : href;
	const resolvedTitle = token ? token.title : title;
	const resolvedText = token ? token.text : text;
	if (!resolvedHref) return resolvedText ?? "";
	const t = resolvedTitle ? ` title="${resolvedTitle}"` : "";
	const externalTarget = /^https?:\/\//i.test(resolvedHref)
		? ` target="_blank" rel="nofollow ugc noopener noreferrer"`
		: "";
	return `<a href="${resolvedHref}"${t}${externalTarget}>${resolvedText}</a>`;
};

/**
 * Renders plain markdown text and auto-linkifies URLs and hashtags.
 * @param {string|object} text - Text segment or marked token.
 * @returns {string} HTML-safe text with generated anchor tags.
 */
renderer.text = function (text) {
	const safeText = typeof text === "string" ? text : (text?.text ?? String(text ?? ""));
	// 1️⃣ Linkify URLs
	let result = safeText.replace(
		/\bhttps?:\/\/[^\s<]+[^\s<.,:;"')\]]/gi,
		(url) => `<a href="${url}" target="_blank" rel="nofollow ugc noopener noreferrer">${url}</a>`
	);
	// 2️⃣ Linkify hashtags
	result = result.replace(
		/\B#([a-zA-Z0-9]+)/g,
		(_, tag) => `<a href="/posts/tag/${encodeURIComponent(tag.toLowerCase())}">#${tag}</a>`
	);

	return result;
};

/**
 * Renders task list checkboxes without the disabled attribute, which browsers grey out,
 * so readers can tick them. The state is not saved.
 * @param {boolean|object} checked - Checked state or marked token.
 * @returns {string} Checkbox input markup.
 */
renderer.checkbox = function (checked) {
	const isChecked = typeof checked === "object" && checked !== null ? checked.checked : checked;
	return `<input type="checkbox" class="task-checkbox"${isChecked ? " checked" : ""}> `;
};

marked.setOptions({ renderer });

module.exports = marked;
