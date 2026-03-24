chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "SHOW_WARNING") {
    showWarningBanner(message.level, message.score);
  }
});

function showWarningBanner(level, score) {
  if (!level) return;

  const existing = document.getElementById("phishing-warning");
  if (existing) return;

  const banner = document.createElement("div");
  banner.id = "phishing-warning";

  banner.style.position = "fixed";
  banner.style.top = "0";
  banner.style.left = "0";
  banner.style.width = "100%";
  banner.style.padding = "15px";
  banner.style.zIndex = "999999";
  banner.style.fontSize = "16px";
  banner.style.fontWeight = "bold";
  banner.style.textAlign = "center";
  banner.style.color = "white";

  if (level === 4) banner.style.backgroundColor = "red";
  else if (level === 3) banner.style.backgroundColor = "orange";
  else if (level === 2) {
    banner.style.backgroundColor = "yellow";
    banner.style.color = "black";
  } else banner.style.backgroundColor = "green";

  banner.innerText = `⚠ Risk Level ${level} (${(score * 100).toFixed(0)}%)`;

  const closeBtn = document.createElement("span");
  closeBtn.innerText = " ✖";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.marginLeft = "20px";
  closeBtn.onclick = () => banner.remove();

  banner.appendChild(closeBtn);

  if (document.body) {
    document.body.appendChild(banner);
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      document.body.appendChild(banner);
    });
  }
}