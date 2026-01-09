import axios from "axios";

export const api = axios.create({
  baseURL: "http://localhost:8080/api-gateway/",
});

// Attach share token from URL query param `share` as `x-share-token` header on client requests
if (typeof window !== "undefined") {
  api.interceptors.request.use((config) => {
    try {
      const params = new URLSearchParams(window.location.search);
      const share = params.get("share");
      if (share) {
        config.headers = config.headers || {};
        config.headers["x-share-token"] = share;
      }
    } catch (_) {
      // ignore
    }
    return config;
  });
}
