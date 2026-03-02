//Update score for user everytime bro switch tab
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url) {
    const score = await calculateRiskScore(0.2, tab.url); //changing 0.2 after AI is in here
    chrome.storage.local.set({ risk_score: score });
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active && tab.url) {
    const score = await calculateRiskScore(0.2, tab.url); //same here
    chrome.storage.local.set({ risk_score: score });
  }
});



//Listen for popup every new popup open
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_RISK_SCORE") {

    //Put AI confidence level here
    (async () => {
      const AssessResult = await calculateRiskScore(1.0,message.url); //here too lmao
      chrome.storage.local.set({ risk_score: AssessResult }, () => {
        sendResponse({ risk_score: AssessResult });
      });
    })();

    return true;
  }
});

//--------------------------Threat assessment logic-----------------
//---Heuristic Rules------

const heuristicRules = [
  {
    name: "longQuery",
    weight: 0.2,
    test: (url) => {
      const query = new URL(url).search;
      return query.length >= 40;
    }
  },
  {
    name: "suskeywords",
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
      const brands = ["paypa1", "rnicrosoft", "g00gle"];
      return brands.some(b => url.toLowerCase().includes(b));
    }
  }
];

async function heuristicFlags(url){
  let totalScore = 0;

  for (const rule of heuristicRules) {
    if (rule.test(url)) {
      totalScore += rule.weight;
    }
  }
  return totalScore;
}


async function domainReputation(url){
    return 0.0; //Still testing
    
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
          return "0.00";
        }
      const domainScore = await domainReputation(url);
      const heuristicScore = await heuristicFlags(url);

  
      const riskScore =
          (confidence * 0.6) +
          (domainScore * 0.3) +
          (heuristicScore * 0.1);

      return (riskScore.toFixed(2));
  
    
}

//Notification mode

const DEFAULT_SETTINGS = {
  level1: { smallNoti: false, threatLevelPopup: false },
  level2: { smallNoti: true,  threatLevelPopup: false, enableSafePage: false },
  level3: { smallNoti: true,  threatLevelPopup: true,  enableSafePage: true, forceInteraction: false },
  level4: { smallNoti: true,  threatLevelPopup: true,  enableSafePage: true, forceInteraction: true, forceReturn: false }
};

async function userWarningSettings() {
  const data = await chrome.storage.sync.get(['warningSettings']);
  return data.warningSettings ?? DEFAULT_SETTINGS;
}


async function warnLevel1(tabId, context) {
  // Silent green badge — always shows
  chrome.action.setBadgeText({ text: '✓', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId });

  const s = (await getSettings()).level1;
  if (s.enablePopup) {
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icon.png', title: '✅ Safe',
      message: s.showThreatLevel ? `Score: ${context.score} — Page appears safe.` : 'This page appears safe.'
    });
  }
}

async function warnLevel2(tabId, context) {
  chrome.action.setBadgeText({ text: '!', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#eab308', tabId });

  const s = (await getSettings()).level2;
  if (!s.enablePopup) return;

  chrome.notifications.create({
    type: 'basic', iconUrl: 'icon.png', title: '⚠️ Low Risk Detected',
    message: s.showThreatLevel ? `Score: ${context.score} — ${context.reason}` : 'This page may have minor risks.'
  });
}

async function warnLevel3(tabId, context) {
  chrome.action.setBadgeText({ text: '!!', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#f97316', tabId });

  const s = (await getSettings()).level3;
  if (!s.enablePopup) return;

  chrome.tabs.sendMessage(tabId, {
    type: 'SHOW_BANNER', level: 3,
    showScore: s.showThreatLevel,
    enableSafePage: s.enableSafePage,
    forceInteraction: s.forceInteraction,
    context
  });
}

async function warnLevel4(tabId, context) {
  chrome.action.setBadgeText({ text: '!!!', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId });

  const s = (await getSettings()).level4;
  if (!s.enablePopup) return;

  if (s.forceInteraction) {
    // Full interstitial block page
    chrome.tabs.update(tabId, {
      url: chrome.runtime.getURL(
        `warning.html?url=${encodeURIComponent(context.url)}&score=${context.score}&forceReturn=${s.forceReturn}&reason=${encodeURIComponent(context.reason)}`
      )
    });
  } else {
    // Degraded to banner
    chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_BANNER', level: 4,
      showScore: s.showThreatLevel,
      enableSafePage: s.enableSafePage,
      forceInteraction: false,
      context
    });
  }
}

