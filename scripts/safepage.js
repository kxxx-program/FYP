// ---------------- GET TARGET URL ----------------
const params = new URLSearchParams(location.search);
const targetUrl = params.get("target");

// Optional: show URL on page (if you add an element for it)
const urlDisplay = document.getElementById("url");
if (urlDisplay && targetUrl) {
  try {
    urlDisplay.textContent = decodeURIComponent(targetUrl);
  } catch {
    urlDisplay.textContent = targetUrl;
  }
}

// ---------------- YES BUTTON (PROCEED) ----------------
const proceedBtn = document.getElementById("proceedBtn");
const cancelBtn = document.getElementById("cancelBtn");

proceedBtn?.addEventListener("click", () => {
  if (!targetUrl) {
    location.href = "https://www.google.com";
    return;
  }

  const decoded = decodeURIComponent(targetUrl);

  // This message now adds the URL to the tempAllowedUrls Set in the background
  chrome.runtime.sendMessage(
    { type: "ALLOW_ONCE", url: decoded },
    () => {
      // Small delay ensures the background script updates the Set before we navigate
      setTimeout(() => {
        location.href = decoded;
      }, 50);
    }
  );
});


cancelBtn?.addEventListener("click", () => {
    location.href = "https://www.google.com";
});
