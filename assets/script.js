/* global axios, Vue, OverType, defaultToolbarButtons */

const defaultState = function () {
	const params = new URLSearchParams(window.location.search);
	return {
		toast: [{ type: "", message: "" }],
		newAccount: { username: "", email: "", password: "", website: "", turnstileToken: "" },
		authCreds: { username: "", password: "" },
		resetPassword: "",
		post: {
			title: params.has("title") ? params.get("title") : "",
			text: params.has("text") ? params.get("text") : "",
			slug: "",
			publishedDate: "",
		},
		blogs: [],
		blogSearch: "",
		blogsLoaded: false,
		newsletter: { subject: "", message: "", testEmail: true },
		myAccount: { username: "", email: "", password: "", name: "", description: "", menu: [], domain: "" },
		note: { title: "", text: "" },
		replies: {},
		replyingTo: null,
		replyText: "",
		imageFile: null,
		deleteConfirm: false,
		isLoading: false,
	};
};
function redirect(path, replace = false) {
	if (replace) window.location.replace(path);
	else window.location.href = path;
}
const app = Vue.createApp({
	data() {
		return defaultState();
	},
	mounted() {
		if (window.location.pathname === "/admin") this.loadBlogs();
	},
	methods: {
		setToast(message, type = "error") {
			this.toast = { type, message, time: new Date().getTime() };
			setTimeout(() => {
				if (new Date().getTime() - this.toast.time >= 3000) {
					this.toast.message = "";
				}
			}, 3500);
		},
		signUp() {
			if (!this.newAccount.username || !this.newAccount.email || !this.newAccount.password) {
				return this.setToast("All fields are mandatory");
			}
			axios
				.post("/api/signup", this.newAccount)
				.then(this.authenticate)
				.catch(() => {
					// A Turnstile token works once, so ask for a new one after a failed attempt.
					this.newAccount.turnstileToken = "";
					window.turnstile?.reset();
				});
		},
		signIn() {
			if (!this.authCreds.username || !this.authCreds.password) {
				return this.setToast("Please enter valid details");
			}
			axios.post("/api/login", this.authCreds).then(this.authenticate);
		},
		forgotPassword() {
			if (!this.authCreds.username) {
				return this.setToast("Please enter your username");
			}
			axios.post("/api/reset", { username: this.authCreds.username }).then((response) => {
				this.setToast(response.data.message, "success");
			});
		},
		completeReset() {
			if (!this.resetPassword) return this.setToast("Please enter a new password");
			const token = window.location.pathname.split("/").pop();
			axios.post(`/api/reset/${token}`, { password: this.resetPassword }).then((response) => {
				this.setToast(response.data.message, "success");
				redirect("/login", true);
			});
		},
		authenticate(response) {
			this.setToast(response.data.message, "success");
			redirect("/", true);
		},
		verifyEmail() {
			if (this.isLoading) return;
			const code = window.location.pathname.split("/").pop();
			this.isLoading = true;
			axios
				.post(`/api/verify/${code}`)
				.then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/");
				})
				.finally(() => (this.isLoading = false));
		},
		resendVerification() {
			axios.post("/api/resend").then((response) => {
				this.setToast(response.data.message, "success");
			});
		},
		updateAccount() {
			const payload = { ...this.myAccount };
			if (Array.isArray(payload.menu)) {
				payload.menu = payload.menu
					.map((item) => ({
						name: (item?.name || "").trim(),
						link: (item?.link || "").trim(),
					}))
					.filter((item) => item.name || item.link);
			}
			axios.put("/api/account", payload).then((response) => {
				this.setToast(response.data.message, "success");
			});
		},
		addMenuItem() {
			if (!Array.isArray(this.myAccount.menu)) this.myAccount.menu = [];
			this.myAccount.menu.push({ name: "", link: "" });
		},
		removeMenuItem(index) {
			this.myAccount.menu.splice(index, 1);
		},
		deleteAccount() {
			if (confirm("Are you sure you want to delete your account?")) {
				axios.delete("/api/account").then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/logout");
				});
			}
		},
		onPostChange() {
			const key = window.location.pathname === "/pages/new" ? "newPage" : "newPost";
			window.localStorage.setItem(key, this.post.text);
		},
		createPost() {
			if (this.isLoading) return;
			if (!this.post.title.trim()) return this.setToast("Title cannot be empty");
			if (!this.post.text.trim()) return this.setToast("Text cannot be empty");
			const title = this.post.title.trim();
			const text = this.post.text.trim();
			this.isLoading = true;
			axios
				.post("/api/posts", {
					title,
					text,
					slug: this.post.slug.trim(),
					publishedDate: this.post.publishedDate,
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				})
				.then((response) => {
					window.localStorage.removeItem("newPost");
					this.setToast(response.data.message, "success");
					redirect("/posts");
				})
				.finally(() => (this.isLoading = false));
		},
		updatePost(id) {
			if (this.isLoading) return;
			if (!this.post.title.trim()) return this.setToast("Title cannot be empty");
			if (!this.post.text.trim()) return this.setToast("Text cannot be empty");
			const title = this.post.title.trim();
			const text = this.post.text.trim();
			this.isLoading = true;
			axios
				.put("/api/posts/" + id, { title, text, slug: this.post.slug.trim(), publishedDate: this.post.publishedDate })
				.then((response) => {
					this.setToast(response.data.message, "success");
				})
				.finally(() => (this.isLoading = false));
		},
		notifySubscribers(id) {
			if (this.isLoading) return;
			if (!confirm("Email this post to your subscribers? This can only be done once.")) return;
			this.isLoading = true;
			axios
				.post(`/api/posts/${id}/notify`)
				.then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/posts");
				})
				.finally(() => (this.isLoading = false));
		},
		deletePost(id) {
			if (confirm("Are you sure you want to delete this post? There is no undo")) {
				axios.delete(`/api/posts/${id}`).then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/posts");
				});
			}
		},
		createPage() {
			if (this.isLoading) return;
			if (!this.post.title.trim()) return this.setToast("Title cannot be empty");
			if (!this.post.text.trim()) return this.setToast("Text cannot be empty");
			const title = this.post.title.trim();
			const text = this.post.text.trim();
			const slug = this.post.slug.trim();
			this.isLoading = true;
			axios
				.post("/api/pages", { title, text, slug, hideTitle: this.post.hideTitle })
				.then((response) => {
					window.localStorage.removeItem("newPage");
					this.setToast(response.data.message, "success");
					redirect("/");
				})
				.finally(() => (this.isLoading = false));
		},
		updatePage(id) {
			if (this.isLoading) return;
			if (!this.post.title.trim()) return this.setToast("Title cannot be empty");
			if (!this.post.text.trim()) return this.setToast("Text cannot be empty");
			const title = this.post.title.trim();
			const text = this.post.text.trim();
			const slug = this.post.slug.trim();
			this.isLoading = true;
			axios
				.put("/api/pages/" + id, { title, text, slug, hideTitle: this.post.hideTitle })
				.then((response) => {
					this.setToast(response.data.message, "success");
				})
				.finally(() => (this.isLoading = false));
		},
		deletePage(id) {
			if (confirm("Are you sure you want to delete this page? There is no undo")) {
				axios.delete(`/api/pages/${id}`).then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/");
				});
			}
		},
		saveNote(id) {
			if (this.isLoading) return;
			if (!this.note.title.trim()) return this.setToast("Title cannot be empty");
			if (!this.note.text.trim()) return this.setToast("Text cannot be empty");
			const payload = { title: this.note.title.trim(), text: this.note.text };
			this.isLoading = true;
			(id ? axios.put("/api/notes/" + id, payload) : axios.post("/api/notes", payload))
				.then((response) => {
					this.setToast(response.data.message, "success");
					if (!id) redirect("/notes");
				})
				.finally(() => (this.isLoading = false));
		},
		deleteNote(id) {
			if (confirm("Are you sure you want to delete this note? There is no undo")) {
				axios.delete(`/api/notes/${id}`).then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/notes");
				});
			}
		},
		setCommentApproval(id, isApproved) {
			axios.put(`/api/comments/${id}`, { isApproved }).then((response) => {
				this.setToast(response.data.message, "success");
				redirect("/comments");
			});
		},
		startReply(id) {
			this.replyingTo = id;
			this.replyText = this.replies[id] || "";
		},
		saveReply(id) {
			if (this.isLoading) return;
			this.isLoading = true;
			axios
				.put(`/api/comments/${id}`, { reply: this.replyText.trim() })
				.then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/comments");
				})
				.finally(() => (this.isLoading = false));
		},
		deleteComment(id) {
			if (confirm("Are you sure you want to delete this comment? There is no undo")) {
				axios.delete(`/api/comments/${id}`).then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/comments");
				});
			}
		},
		deleteSubscriber(id) {
			if (confirm("Are you sure you want to remove this subscriber? There is no undo")) {
				axios.delete(`/api/subscribers/${id}`).then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/subscribers");
				});
			}
		},
		uploadFavicon(event) {
			const file = event.target.files[0];
			if (!file || this.isLoading) return;
			if (file.type !== "image/png") return this.setToast("Favicon must be a PNG image");
			if (file.size > 512 * 1024) return this.setToast("Favicon must be 512KB or smaller");
			const form = new FormData();
			form.append("favicon", file);
			this.isLoading = true;
			axios
				.post("/api/favicon", form)
				.then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/settings");
				})
				.finally(() => (this.isLoading = false));
		},
		deleteFavicon() {
			if (confirm("Remove your favicon?")) {
				axios.delete("/api/favicon").then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/settings");
				});
			}
		},
		onImageChange(event) {
			this.imageFile = event.target.files[0] || null;
		},
		uploadImage() {
			if (this.isLoading) return;
			if (!this.imageFile) return this.setToast("Choose an image to upload");
			if (this.imageFile.size > 1024 * 1024) return this.setToast("Image must be 1MB or smaller");
			const form = new FormData();
			form.append("image", this.imageFile);
			this.isLoading = true;
			axios
				.post("/api/images", form)
				.then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/images");
				})
				.finally(() => (this.isLoading = false));
		},
		deleteImage(id) {
			if (confirm("Are you sure you want to delete this image? There is no undo")) {
				axios.delete(`/api/images/${id}`).then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/images");
				});
			}
		},
		loadBlogs() {
			axios.get("/api/admin/blogs", { params: { q: this.blogSearch.trim() } }).then((response) => {
				this.blogs = response.data.blogs;
				this.blogsLoaded = true;
			});
		},
		adminDeleteBlog(blog) {
			const reason = prompt(
				`Permanently delete the blog "${blog.username}" and all of its content? There is no undo.\n\nThis reason will be emailed to the user:`
			);
			if (reason === null) return;
			if (!reason.trim()) return this.setToast("A reason is required to delete a blog");
			axios.delete(`/api/admin/blogs/${blog._id}`, { data: { reason: reason.trim() } }).then((response) => {
				this.setToast(response.data.message, "success");
				this.blogs = this.blogs.filter((item) => item._id !== blog._id);
			});
		},
		adminDeleteDomain(blog) {
			if (!confirm(`Remove the domain "${blog.domain}" from ${blog.username}?`)) return;
			axios.delete(`/api/admin/blogs/${blog._id}/domain`).then((response) => {
				this.setToast(response.data.message, "success");
				blog.domain = "";
				blog.url = `${window.location.protocol}//${blog.username}.${window.location.host}/`;
			});
		},
		onTestEmailChange(event) {
			// Ask for confirmation before switching off the safety of a test-only send.
			if (!event.target.checked) {
				const confirmed = confirm(
					"This will send the newsletter to ALL users. Are you sure you want to disable test email?"
				);
				if (!confirmed) this.newsletter.testEmail = true;
			}
		},
		sendNewsletter() {
			if (this.isLoading) return;
			if (!this.newsletter.subject.trim()) return this.setToast("Subject cannot be empty");
			if (!this.newsletter.message.trim()) return this.setToast("Message cannot be empty");
			if (!this.newsletter.testEmail) {
				if (!confirm("Send this newsletter to ALL users? This cannot be undone.")) return;
			}
			this.isLoading = true;
			axios
				.post("/api/admin/newsletter", {
					subject: this.newsletter.subject.trim(),
					message: this.newsletter.message.trim(),
					testEmail: this.newsletter.testEmail,
				})
				.then((response) => {
					this.setToast(response.data.message, "success");
				})
				.finally(() => (this.isLoading = false));
		},
	},
});

// Markdown editor (overtype.dev) bound to a value. Emits an "overtype-change" event carrying the new markdown.
app.directive("overtype", {
	mounted(el, binding) {
		const [editor] = new OverType(el, {
			value: binding.value || "",
			placeholder: el.dataset.placeholder || "",
			toolbar: true,
			// The default toolbar without the view-mode (eye) toggle, which confuses non-technical users.
			toolbarButtons: defaultToolbarButtons.filter((button, i, all) => {
				if (button.name === "viewMode") return false;
				return !(button.name === "separator" && all[i + 1]?.name === "viewMode");
			}),
			autoResize: true,
			minHeight: "7rem",
			fontSize: "1rem",
			theme: {
				name: "veenew",
				colors: {
					bgPrimary: "var(--ot-background)",
					bgSecondary: "var(--ot-shade)",
					text: "var(--ot-text)",
					h1: "var(--ot-text)",
					h2: "var(--ot-text)",
					h3: "var(--ot-text)",
					strong: "var(--ot-text)",
					em: "var(--ot-text)",
					link: "var(--ot-text)",
					code: "var(--ot-text)",
					codeBg: "var(--ot-shade)",
					blockquote: "var(--ot-muted)",
					hr: "var(--ot-muted)",
					syntaxMarker: "var(--ot-muted)",
					cursor: "var(--ot-text)",
					// The browser's own selection color, translucent so the styled text underneath stays visible.
					selection: "color-mix(in srgb, Highlight 40%, transparent)",
					toolbarBg: "var(--ot-background)",
					toolbarIcon: "var(--ot-text)",
					toolbarHover: "var(--ot-shade)",
					toolbarActive: "var(--ot-grey)",
					border: "var(--ot-grey)",
				},
			},
			onChange: (value) => el.dispatchEvent(new CustomEvent("overtype-change", { detail: value })),
		});
		el._overtype = editor;
	},
	updated(el, binding) {
		if (el._overtype && binding.value !== el._overtype.getValue()) el._overtype.setValue(binding.value || "");
	},
	unmounted(el) {
		el._overtype?.destroy();
	},
});

const App = app.mount("#app");

(() => {
	const csrfToken = document.cookie
		.split("; ")
		.find((c) => c.startsWith("csrf_cookie="))
		?.split("=")[1];
	if (csrfToken) axios.defaults.headers.common["x-csrf-token"] = csrfToken;

	axios.interceptors.response.use(
		(response) => response,
		(error) => {
			console.log(error);
			App.setToast(error.response?.data?.message || "Something went wrong. Please try again");
			throw error;
		}
	);
})();
