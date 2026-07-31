const urlInput = document.getElementById("url");
const tokenInput = document.getElementById("token");
const status = document.getElementById("status");

chrome.storage.sync.get(["radarUrl", "radarToken"], (s) => {
  urlInput.value = s.radarUrl || "http://localhost:3000";
  tokenInput.value = s.radarToken || "";
});

document.getElementById("save").addEventListener("click", async () => {
  status.textContent = "Saving…";
  await chrome.storage.sync.set({
    radarUrl: urlInput.value.trim().replace(/\/$/, ""),
    radarToken: tokenInput.value.trim(),
  });

  const reply = await chrome.runtime.sendMessage({ type: "ping" });
  if (reply && reply.ok) {
    const s = reply.data;
    status.textContent =
      `Connected.\n${s.ai.total} AI roles · ${s.fde.total} FDE roles\n` +
      `${s.companies} boards tracked.`;
  } else {
    status.textContent = `Could not reach the radar:\n${reply ? reply.error : "no response"}`;
  }
});
