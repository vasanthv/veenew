/* global axios, Vue */

const defaultState = function () {
	const params = new URLSearchParams(window.location.search);
	return {
		toast: [{ type: "", message: "" }],
		newAccount: { username: "", email: "", password: "" },
		authCreds: { username: "", password: "" },
		post: { text: params.has("text") ? params.get("text") : "", slug: "" },
		myAccount: { username: "", email: "", password: "", name: "", bio: "", menu: [], domain: "" },
		deleteConfirm: false,
		isLoading: false,
		importFile: null,
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
			axios.post("/api/signup", this.newAccount).then(this.authenticate);
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
		authenticate(response) {
			this.setToast(response.data.message, "success");
			redirect(this.urlState ?? "/", true);
		},
		resendVerification() {
			axios.post("/api/resend").then((response) => {
				this.setToast(response.data.message, "success");
			});
		},
		updateAccount() {
			const payload = {
				...this.myAccount,
				menu: (this.myAccount.menu || [])
					.map((item) => ({
						name: (item?.name || "").trim(),
						link: (item?.link || "").trim(),
					}))
					.filter((item) => item.name || item.link),
			};
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
			if (!this.post.text.trim()) return this.setToast("Text cannot be empty");
			const text = this.post.text.trim();
			this.isLoading = true;
			axios
				.post("/api/posts", { text })
				.then((response) => {
					window.localStorage.removeItem("newPost");
					this.setToast(response.data.message, "success");
					redirect("/");
				})
				.finally(() => (this.isLoading = false));
		},
		updatePost(id) {
			if (this.isLoading) return;
			if (!this.post.text.trim()) return this.setToast("Text cannot be empty");
			const text = this.post.text.trim();
			this.isLoading = true;
			axios
				.put("/api/posts/" + id, { text })
				.then((response) => {
					this.setToast(response.data.message, "success");
				})
				.finally(() => (this.isLoading = false));
		},
		deletePost(id) {
			if (confirm("Are you sure you want to delete this post? There is no undo")) {
				axios.delete(`/api/posts/${id}`).then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/");
				});
			}
		},
		createPage() {
			if (this.isLoading) return;
			if (!this.post.text.trim()) return this.setToast("Text cannot be empty");
			const text = this.post.text.trim();
			const slug = this.post.slug.trim();
			this.isLoading = true;
			axios
				.post("/api/pages", { text, slug })
				.then((response) => {
					window.localStorage.removeItem("newPage");
					this.setToast(response.data.message, "success");
					redirect("/pages");
				})
				.finally(() => (this.isLoading = false));
		},
		updatePage(id) {
			if (this.isLoading) return;
			if (!this.post.text.trim()) return this.setToast("Text cannot be empty");
			const text = this.post.text.trim();
			const slug = this.post.slug.trim();
			this.isLoading = true;
			axios
				.put("/api/pages/" + id, { text, slug })
				.then((response) => {
					this.setToast(response.data.message, "success");
				})
				.finally(() => (this.isLoading = false));
		},
		deletePage(id) {
			if (confirm("Are you sure you want to delete this page? There is no undo")) {
				axios.delete(`/api/pages/${id}`).then((response) => {
					this.setToast(response.data.message, "success");
					redirect("/pages");
				});
			}
		},
		onImportFileChange(event) {
			this.importFile = event.target.files[0] || null;
		},
		importPosts() {
			if (this.isLoading) return;
			if (!this.importFile) return this.setToast("Please choose a JSON file");
			const formData = new FormData();
			formData.append("file", this.importFile);
			this.isLoading = true;
			axios
				.post("/api/import", formData)
				.then((response) => {
					this.setToast(response.data.message, "success");
				})
				.catch(() => {
					this.importFile = null;
					if (this.$refs.fileInput) this.$refs.fileInput.value = "";
				})
				.finally(() => (this.isLoading = false));
		},
		timeAgo(dateString) {
			const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
			let interval = seconds / 31536000;
			if (interval > 1) {
				const count = Math.floor(interval);
				return `${count} year${count === 1 ? "" : "s"} ago`;
			}
			interval = seconds / 2592000;
			if (interval > 1) {
				const count = Math.floor(interval);
				return `${count} month${count === 1 ? "" : "s"} ago`;
			}
			interval = seconds / 86400;
			if (interval > 1) {
				const count = Math.floor(interval);
				return `${count} day${count === 1 ? "" : "s"} ago`;
			}
			interval = seconds / 3600;
			if (interval > 1) {
				const count = Math.floor(interval);
				return `${count} hour${count === 1 ? "" : "s"} ago`;
			}
			interval = seconds / 60;
			if (interval > 1) {
				const count = Math.floor(interval);
				return `${count} minute${count === 1 ? "" : "s"} ago`;
			}
			return "now";
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
			App.setToast(error.response.data.message || "Something went wrong. Please try again");
			throw error;
		}
	);

})();
