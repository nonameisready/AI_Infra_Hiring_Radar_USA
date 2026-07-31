/**
 * All network traffic to the radar happens here rather than in the content
 * script: the service worker is not bound by the job board's connect-src CSP,
 * and host_permissions already cover the cross-origin request.
 */

async function settings() {
  const { radarUrl, radarToken } = await chrome.storage.sync.get(["radarUrl", "radarToken"]);
  return {
    url: (radarUrl || "http://localhost:3000").replace(/\/$/, ""),
    token: radarToken || "",
  };
}

async function radarFetch(pathname, init = {}) {
  const { url, token } = await settings();
  const res = await fetch(`${url}${pathname}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch (e) {
    throw new Error(text.slice(0, 200));
  }
  if (!res.ok) throw new Error(json.error || `${res.status} ${res.statusText}`);
  return json;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "getPayload") {
    const params = new URLSearchParams();
    if (msg.track) params.set("track", msg.track);
    if (msg.jobId) params.set("jobId", msg.jobId);
    radarFetch(`/api/autofill/payload?${params}`)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === "reportFilled") {
    radarFetch("/api/autofill/payload", {
      method: "POST",
      body: JSON.stringify({ jobId: msg.jobId, submitted: msg.submitted, detail: msg.detail }),
    })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === "ping") {
    radarFetch("/api/stats")
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  return false;
});
