chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "SHOW_WARNING") {
    showWarningBanner(message.level, message.score, message.riskKey);
  }
});

function showWarningBanner(level, score, riskKey) {
  if (!level) return;

  const existing = document.getElementById("phishing-warning");
  if (existing) return;

   const banner = document.createElement("div");
  banner.id = "phishing-warning";

  // Position
  banner.style.position = "fixed";
  banner.style.top = "20px";
  banner.style.right = "10px";   
  banner.style.width = "260px";  
  banner.style.padding = "12px 16px";
  banner.style.zIndex = "999999";

  // Style
  banner.style.fontSize = "14px"; 
  banner.style.fontWeight = "600";
  banner.style.color = "white";
  banner.style.borderRadius = "12px"; 
  banner.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
  banner.style.display = "flex";
  banner.style.justifyContent = "space-between";
  banner.style.alignItems = "center";
  banner.style.opacity = "1";
  banner.style.transition = "opacity 0.5s ease, transform 0.3s ease";
  banner.style.transform = "translateY(-10px)";

  // Color logic
  if (level === 4) banner.style.backgroundColor = "#e53935"; 
  else if (level === 3) banner.style.backgroundColor = "#fb8c00";
  else if (level === 2) {
    banner.style.backgroundColor = "#fdd835";
    banner.style.color = "black";
  } else banner.style.backgroundColor = "#43a047";

  const text = document.createElement("span");
  text.innerText = `⚠ Risk Level ${level}: ${riskKey} (${(score * 100).toFixed(0)}%)`;

  const closeBtn = document.createElement("span");
  closeBtn.innerText = "✖";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.marginLeft = "10px";
  closeBtn.style.fontSize = "14px";
  closeBtn.onclick = () => banner.remove();

  banner.appendChild(text);
  banner.appendChild(closeBtn);

  if (document.body) {
    document.body.appendChild(banner);
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      document.body.appendChild(banner);
    });
  }

  // Animate in
  setTimeout(() => {
    banner.style.transform = "translateY(0)";
  }, 50);

  // Auto-dismiss
  setTimeout(() => {
    banner.style.opacity = "0";
    banner.style.transform = "translateY(-10px)";
    setTimeout(() => banner.remove(), 500);
  }, 3000);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "PRESS_TO_PROCEED") {
    showPopupClick(message.riskKey);
  }
});

function showPopupClick(riskKey){
    alert("Detected " + riskKey + " risk link, proceed?");
}



