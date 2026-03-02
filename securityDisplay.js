//URL frontendExtraction for display
document.addEventListener("DOMContentLoaded", async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tabs[0].url;
  document.getElementById("url").textContent = url;


  // Ask background for a FRESH score right now
  chrome.runtime.sendMessage({ type: "GET_RISK_SCORE", url: url }, (response) => {
    if (response && response.risk_score !== undefined) {
      document.getElementById("riskLevelScore").textContent = response.risk_score;
    } else {
      document.getElementById("riskLevelScore").textContent = "Error";
    }
  });

   chrome.runtime.sendMessage({ type: "GET_RISK_SCORE", url: url }, (response) => {
    if (response && response.risk_score !== undefined) {
      const score = parseFloat(response.risk_score);
      applyScore(score); 
    }
  });
});


//Go to whitelist page
document.getElementById("openPage").addEventListener("click", function() {
     chrome.tabs.create({
        url: chrome.runtime.getURL("whitelist.html")
    });
});


//-----------------------------


//Risk Level display
const statuses = {
      1: { color: '#22c55e', label: 'SAFE'},
      2: { color: '#eab308', label: 'LOW-RISK'},
      3: { color: '#f97316', label: 'MODERATE-RISK'},
      4: { color: '#ef4444', label: 'HIGH-RISK'},
};

//determine the range of the score
    function score_range(risk_score){
      if(risk_score <= 0.25)return 1;
      if(risk_score <= 0.46)return 2;
      if(risk_score <= 0.70)return 3;
      return 4;
    }

  

//how much the bar fill base on risk status
    const segments = [1,2,3,4].map(i => document.getElementById('seg' + i));


    function handleResponse(){

      const val = chrome.storage.local.get({ risk_score }); 

      applyScore(val);
    }


    function applyScore(risk_score) {
      const zone = score_range(risk_score)

      // Bar fill to according risk level
      segments.forEach((seg, i) => {
        seg.className = 'bar-seg';
        if (i < zone) seg.classList.add('active-' + zone);
      });

      //Icon color
      const icon = document.querySelector('.level-icon');

      // Remove any existing active-* class
      icon.classList.remove('active-1', 'active-2', 'active-3', 'active-4');

  
      icon.classList.add(`active-${zone}`);
    }

  

