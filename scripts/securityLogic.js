importScripts(chrome.runtime.getURL("libs/ort.min.js"));
ort.env.wasm.wasmPaths = chrome.runtime.getURL("libs/");
 
let ortSession = null;
let char2idx = {};
const MAX_LEN = 120;
 
async function loadModel() {
  if (ortSession) return ortSession;
 
  // Load char2idx vocab
  const vocabUrl = chrome.runtime.getURL("model/char2idx.json");
  const res = await fetch(vocabUrl);
  char2idx = await res.json();
 
  // Load ONNX model
  const modelUrl = chrome.runtime.getURL("model/hybrid_cnn_lstm_model.onnx");
  ortSession = await ort.InferenceSession.create(modelUrl, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all"
  });
 
  return ortSession;
}
 
async function runAiModel(url) {
  try {
    const session = await loadModel();
 
    // Encode using char2idx vocab
    const padded = new Array(MAX_LEN).fill(0);
    Array.from(url.toLowerCase()).slice(0, MAX_LEN).forEach((c, i) => {
      padded[i] = char2idx[c] || 0;
    });
 
    // int64 tensor (Embedding layer requires integer input)
    const inputTensor = new ort.Tensor(
      "int64",
      BigInt64Array.from(padded.map(BigInt)),
      [1, MAX_LEN]
    );
 
    const results = await session.run({ input_ids: inputTensor });
 
    // Apply sigmoid to convert logit → probability
    const logit = Number(results["output"].data[0]);
    const confidence = 1 / (1 + Math.exp(-logit));
    const label = confidence > 0.5 ? "phishing" : "legitimate";
 
    console.log(`[AI] label: ${label}, confidence: ${confidence.toFixed(4)}`);
    return { confidence, label };
 
  } catch (err) {
    console.error("[AI] runAiModel failed:", err);
    return { confidence: 0.0, label: "unknown" };
  }
}
 
 
// ---------------- TAB LISTENERS ----------------
 
const lastProcessed = new Map();
 
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || lastProcessed.get(tabId) === tab.url) return;
    lastProcessed.set(tabId, tab.url);
    await assessAndStore(tabId, tab.url, "activated");
  } catch (err) {
    console.error("[RiskEngine] onActivated error:", err);
  }
});
 
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.active || !tab.url) return;
  if (lastProcessed.get(tabId) === tab.url) return;
  lastProcessed.set(tabId, tab.url);
  await assessAndStore(tabId, tab.url, "updated");
});
 
chrome.tabs.onRemoved.addListener((tabId) => {
  lastProcessed.delete(tabId);
});
 
 
// ---------------- ASSESS AND STORE ----------------
 
async function assessAndStore(tabId, url, source) {
  if (!url || url.startsWith("chrome://") || url.startsWith("about:")) return;
 
  try {
    // FIX 1: destructure { confidence, label } from runAiModel
    const { confidence, label } = await runAiModel(url);
    const { score: AssessResult, flags } = await calculateRiskScore(confidence, url);
 
    await chrome.storage.local.set({
      risk_score: AssessResult,
    });
 
    notificationTrigger(AssessResult, tabId);
 
    console.log(`[RiskEngine] ${source} → score: ${AssessResult}, label: ${label}, confidence: ${confidence}, flags: ${flags}`);
  } catch (err) {
    console.error("[RiskEngine] assessAndStore failed:", err);
  }
}
 
 
// ---------------- MESSAGE LISTENER ----------------
 
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "GET_RISK_SCORE" || !message.url) return false;
 
  (async () => {
    const { confidence, label } = await runAiModel(message.url);
    const { score: AssessResult, flags } = await calculateRiskScore(confidence, message.url);
 
    chrome.storage.local.set({ risk_score: AssessResult });
    sendResponse({ risk_score: AssessResult, label: label, flags: flags });
  })();
 
  return true;
});
 
 
// ---------------- HEURISTIC RULES ----------------
 
const heuristicRules = [
  {
    name: "longQuery",
    weight: 0.2,
    test: (url) => {
      const query = new URL(url).search;
      return query.length > 1 && query.length - 1 >= 50;
    }
  },
  {
    name: "susKeywords",
    weight: 0.3,
    test: (url) => {
      const keywords = ["login", "verify", "update", "secure", "add", "delete"];
      return keywords.some(k => url.toLowerCase().includes(k));
    }
  },
  {
     name: "fakeBrand",
    weight: 0.5,
    test: (url) => {
      const brands = ["paypa1", "rnicrosoft", "g00gle", "chotgpt"];
      const normalized = url.toLowerCase()
        .replace(/0/g, "o")
        .replace(/1/g, "l")
        .replace(/3/g, "e")
        .replace(/@/g, "a");
      return brands.some(b => normalized.includes(
        b.replace(/0/g, "o").replace(/1/g, "l")
      ));
    }
  }
];
 
async function heuristicFlags(url) {
  let totalScore = 0.0;
  const triggered = [];
  for (const rule of heuristicRules) {
    if (rule.test(url)) {
      totalScore += rule.weight;
      triggered.push(rule.name);
    }
  }
  return { totalScore, triggered };
}
 
async function domainReputation(url) {
  return 0.00; // Still testing
}
 
async function whiteListCheck(url) {
  const data = await chrome.storage.local.get("urlList");
  const urlList = data.urlList || [];
 
  return urlList.some((item) => {
    try {
      const savedHost = new URL(item.url).hostname.replace(/^www\./, "");
      const checkHost = new URL(url).hostname.replace(/^www\./, "");
      return savedHost === checkHost;
    } catch {
      return false;
    }
  });
}
 
async function calculateRiskScore(confidence, url) {
  const whitelisted = await whiteListCheck(url);
  if (whitelisted) return { score: 0.00, flags: [], whitelisted: true };
 
  const domainScore = await domainReputation(url);
  const { totalScore: heuristicScore, triggered: flags } = await heuristicFlags(url);
 
  const riskScore =
    (confidence * 0.6) +
    (domainScore * 0.2) +
    (heuristicScore * 0.2);
 
  return { score: Number(riskScore.toFixed(2)), flags, whitelisted: false };
}
 
 
// ---------------- RISK LEVEL ----------------
 
function getRiskLevel(score) {
  if (score <= 0.25) return 1;
  if (score <= 0.46) return 2;
  if (score <= 0.70) return 3;
  return 4;
}
 
function notificationTrigger(score, tabId) {
  const level = getRiskLevel(score);
 
  if (level === 4) {
    chrome.tabs.update(tabId, {
      url: chrome.runtime.getURL("UI/blocked.html")
    });
  }
 
  if (level >= 3) {
    showSystemNotification(level, score);
  }
 
  handleRisk(level, tabId, score);
  updateBadge(level);
}
 
 
// ---------------- CONTENT SCRIPT MESSAGE ----------------
 
async function handleRisk(level, tabId, score) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: "SHOW_WARNING",
      level: level,
      score: score
    });
  } catch (e) {
    console.log("Content script not ready");
  }
}
 
 
// ---------------- NOTIFICATION ----------------
 
function showSystemNotification(level, score) {
  const levelText = ["Safe", "Low", "Moderate", "High"][level - 1];
 
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title: "⚠ Phishing Warning",
    message: `Risk: ${levelText} (${(score * 100).toFixed(0)}%)`
  });
}
 
 
// ---------------- BADGE ----------------
 
function updateBadge(level) {
  if (level === 4) {
    chrome.action.setBadgeText({ text: "!!" });
    chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
  } else if (level === 3) {
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#FFA500" });
  } else if (level === 2) {
    chrome.action.setBadgeText({ text: "?" });
    chrome.action.setBadgeBackgroundColor({ color: "#FFFF00" });
  } else {
    chrome.action.setBadgeText({ text: "^" });
    chrome.action.setBadgeBackgroundColor({ color: "#00db50" });
  }
}