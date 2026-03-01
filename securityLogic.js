//Update score for user everytime bro switch tab
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url) {
    const score = await calculateRiskScore(0.2, tab.url);
    chrome.storage.local.set({ risk_score: score });
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active && tab.url) {
    const score = await calculateRiskScore(0.2, tab.url);
    chrome.storage.local.set({ risk_score: score });
  }
});



//Listen for popup every new popup open
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_RISK_SCORE") {

    //Put AI confidence level here
    (async () => {
      const AssessResult = await calculateRiskScore(1.0,message.url);
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

async function calculateRiskScore(confidence, url) {

      const domainScore = await domainReputation(url);
      const heuristicScore = await heuristicFlags(url);

  
      const riskScore =
          (confidence * 0.6) +
          (domainScore * 0.3) +
          (heuristicScore * 0.1);

      return (riskScore.toFixed(1));
  
    
}




