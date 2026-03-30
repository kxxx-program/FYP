document.addEventListener("DOMContentLoaded", async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tabs[0].url;

  document.getElementById("url").textContent = url;

  chrome.runtime.sendMessage({ type: "GET_RISK_SCORE", url }, (response) => {
    if (response && response.risk_score !== undefined) {
      const score = Number(response.risk_score);
      const flags = response.flags || [];
      document.getElementById("riskLevelScore").textContent = score.toFixed(2);
      applyScore(score);
      applyFlags(flags);
    } else {
      document.getElementById("riskLevelScore").textContent = "Error";
    }
  });
});

// whitelist button
document.getElementById("openPage").addEventListener("click", () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("UI/whitelist.html")
  });
});

// UI logic
function score_range(score) {
  if (score <= 0.25) return 1;
  if (score <= 0.46) return 2;
  if (score <= 0.70) return 3;
  return 4;
}

function applyScore(score) {
  const zone = score_range(score);

  const segments = [1, 2, 3, 4].map(i => document.getElementById("seg" + i));

  segments.forEach((seg, i) => {
    seg.className = "bar-seg";
    if (i < zone) seg.classList.add("active-" + zone);
  });

  const icon = document.querySelector(".level-icon");
  icon.classList.remove("active-1", "active-2", "active-3", "active-4");
  icon.classList.add(`active-${zone}`);
  
  const levelNames = ["Safe", "Low Risk", "Moderate Risk", "High Risk"];
  document.getElementById("risk-title").textContent = levelNames[zone - 1];
}


//Message box

const flagMessages = {
  longQuery: "!! URL has an unusually long query string",
  susKeywords: "!!  URL contains suspicious keywords (e.g. login, verify, secure)",
  fakeBrand: "!! URL may be impersonating a known brand"
};

function applyFlags(flags) {
  const container = document.getElementById("riskLevelScore");
 
  if (flags.length === 0) {
    container.textContent = "No specific flags triggered.";
    return;
  }
 
  container.innerHTML = ""; // clear "Loading"
 
  flags.forEach(flag => {
    const line = document.createElement("div");
    line.textContent = flagMessages[flag] || `⚠ ${flag}`;
    line.style.marginBottom = "4px";
    container.appendChild(line);
  });
}