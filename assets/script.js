/* global axios, Vue */

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
		bookmark: { title: "", url: "", notes: "", isPrivate: false },
		microblog: { text: "" },
		photoFile: null,
		deleteConfirm: false,
		isLoading: false,
	};
};
function redirect(path, replace = false) {
	if (replace) window.location.replace(path);
	else window.location.href = path;
}
const App = Vue.createApp({
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
		saveBookmark(id) {
			if (this.isLoading) return;
			if (!this.bookmark.url.trim()) return this.setToast("Link cannot be empty");
			const payload = {
				url: this.bookmark.url.trim(),
				title: this.bookmark.title.trim(),
				notes: this.bookmark.notes.trim(),
				isPrivate: this.bookmark.isPrivate,
			};
			this.isLoading = true;
			(id ? axios.put("/api/bookmarks/" + id, payload) : axios.post("/api/bookmarks", payload))
				.then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/bookmarks");
				})
				.finally(() => (this.isLoading = false));
		},
		deleteBookmark(id) {
			if (confirm("Are you sure you want to delete this bookmark? There is no undo")) {
				axios.delete(`/api/bookmarks/${id}`).then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/bookmarks");
				});
			}
		},
		saveMicroblog(id) {
			if (this.isLoading) return;
			if (!this.microblog.text.trim()) return this.setToast("Microblog cannot be empty");
			const payload = { text: this.microblog.text.trim() };
			this.isLoading = true;
			(id ? axios.put("/api/microblogs/" + id, payload) : axios.post("/api/microblogs", payload))
				.then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/microblogs");
				})
				.finally(() => (this.isLoading = false));
		},
		deleteMicroblog(id) {
			if (confirm("Are you sure you want to delete this microblog? There is no undo")) {
				axios.delete(`/api/microblogs/${id}`).then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/microblogs");
				});
			}
		},
		setGuestbookApproval(id, isApproved) {
			axios.put(`/api/guestbook/${id}`, { isApproved }).then((response) => {
				this.setToast(response.data.message, "success");
				redirect("/guestbook");
			});
		},
		deleteGuestbookEntry(id) {
			if (confirm("Are you sure you want to delete this guestbook entry? There is no undo")) {
				axios.delete(`/api/guestbook/${id}`).then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/guestbook");
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
		onPhotoChange(event) {
			this.photoFile = event.target.files[0] || null;
		},
		uploadPhoto() {
			if (this.isLoading) return;
			if (!this.photoFile) return this.setToast("Choose a photo to upload");
			if (this.photoFile.size > 1024 * 1024) return this.setToast("Photo must be 1MB or smaller");
			const form = new FormData();
			form.append("photo", this.photoFile);
			this.isLoading = true;
			axios
				.post("/api/photos", form)
				.then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/photos");
				})
				.finally(() => (this.isLoading = false));
		},
		deletePhoto(id) {
			if (confirm("Are you sure you want to delete this photo? There is no undo")) {
				axios.delete(`/api/photos/${id}`).then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/photos");
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
				.post("/api/newsletter", {
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
}).mount("#app");

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
