// importScripts(chrome.runtime.getURL("scripts/ort.min.js"));
 
// const SEQ_LEN   = 120;
// const VOCAB_SIZE = 160;
 
// function tokenizeUrl(url) {
//   const ids = new BigInt64Array(SEQ_LEN); // zero-initialised (padding = 0)
//   const len  = Math.min(url.length, SEQ_LEN);
//   for (let i = 0; i < len; i++) {
//     ids[i] = BigInt(url.charCodeAt(i) % VOCAB_SIZE);
//   }
//   return ids;
// }


// let _session = null; // cached InferenceSession
 
// async function getOnnxSession() {
//   if (_session) return _session;
//   const modelUrl = chrome.runtime.getURL("hybrid_cnn_lstm_model.onnx");
//   _session = await ort.InferenceSession.create(modelUrl, {
//     executionProviders: ["wasm"],
//   });
//   return _session;
// }
 
// function sigmoid(x) {
//   return 1 / (1 + Math.exp(-x));
// }

// async function runAiModel(url) {
//   try {
//     const session = await getOnnxSession();
//     const tokenIds = tokenizeUrl(url);
 
//     // Shape: [1 (batch), 120 (seq_len)]
//     const tensor = new ort.Tensor("int64", tokenIds, [1, SEQ_LEN]);
//     const feeds   = { input_ids: tensor };
 
//     const results  = await session.run(feeds);
//     const logit    = results["output"].data[0]; // single float32
//     const confidence = sigmoid(logit);           // phishing probability
 
//     console.log(`[AI] url="${url}" logit=${logit.toFixed(4)} confidence=${confidence.toFixed(4)}`);
//     return confidence; // number in [0, 1]
//   } catch (err) {
//     console.error("[AI] ONNX inference failed:", err);
//     return 0.5; // neutral fallback so the extension still works
//   }
// }



//check tabs
const lastProcessed = new Map();

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || lastProcessed.get(tabId) === tab.url) return; // dedup
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


//Calculation storing
async function assessAndStore(tabId, url, source) {
  
  if (!url || url.startsWith("chrome://") || url.startsWith("about:")) return;
 
  try {
    //Ai confidence put here
    // const confidence = await runAiModel(url);
    const AssessResult = await calculateRiskScore(0.5, url);
 
    await chrome.storage.local.set({
      risk_score: AssessResult,
    });

    notificationTrigger(AssessResult, tabId);
 
    console.log(`[RiskEngine] ${source} → score: ${AssessResult}, confidence: ${1.3}, flags: ${flags}`);
  } catch (err) {
    console.error("[RiskEngine] assessAndStore failed:", err);
  }
}


//Get url
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "GET_RISK_SCORE" || !message.url) return false;

  (async () => {
      //Put AI confidence level here
    //  const confidence = await runAiModel(url);


    //-------------------------
    const AssessResult = await calculateRiskScore(0.5,message.url); //here too lmao
    chrome.storage.local.set({ 
    risk_score: AssessResult
      });

      sendResponse({ risk_score: AssessResult });
    })();
    return true;
});


//--------------------------Threat assessment logic-----------------
//---Heuristic Rules------

const heuristicRules = [
  {
    name: "longQuery",
    weight: 0.2,
    test: (url) => {
      const query = new URL(url).search;
      return query.length > 1 && query.length - 1 >= 40; // subtract the "?"
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
      // Normalize leet-speak
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

async function heuristicFlags(url){
  let totalScore = 0.0;

  for (const rule of heuristicRules) {
    if (rule.test(url)) {
      totalScore += rule.weight;
    }
  }
  return totalScore;
}


async function domainReputation(url){
    return 0.00; //Still testing
    
}

//whitelist testing
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
        if (whitelisted) {
          return 0.00;
        }
      const domainScore = await domainReputation(url);
      const heuristicScore = await heuristicFlags(url);

  
      const riskScore =
          (confidence * 0.6) +
          (domainScore * 0.2) +
          (heuristicScore * 0.2);

      return Number(riskScore.toFixed(2));
  
    
}

//Notification
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
    chrome.action.setBadgeText({ text: "!" });
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



