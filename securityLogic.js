//URL Extraction
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const currentTab = tabs[0];
  const url = currentTab.url;

  document.getElementById("url").textContent = url;
});

//Go to whitelist page
document.getElementById("openPage").addEventListener("click", function() {
     chrome.tabs.create({
        url: chrome.runtime.getURL("whitelist.html")
    });
});
//-----------------------------



//Threat assessment logic


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

//TESTING FOR BAR WILL REMOVE LATER
    const scoreInput  = document.getElementById('scoreInput');
    const riskTitle   = document.getElementById('risktitle');
    const assessReason = document.getElementById('assessReason');
    //remove later
    const errorMsg    = document.getElementById('errorMsg');
    const applyBtn    = document.getElementById('applyBtn');
  

//how much the bar fill base on risk status
    const segments = [1,2,3,4].map(i => document.getElementById('seg' + i));



    function applyScore(risk_score) {
      const zone = score_range(risk_score)
      const s = statuses[zone];

      // Update CSS variable for reactive coloring
      document.body.style.setProperty('--current-color', s.color);


      // Bar fill to according risk level
      segments.forEach((seg, i) => {
        seg.className = 'bar-seg';
        if (i < zone) seg.classList.add('active-' + zone);
      });
    }

    function handleApply() {
  const raw = scoreInput.value.trim();
  const val = parseFloat(raw);             // parseFloat, NOT parseInt (decimals!)
  errorMsg.textContent = '';

  if (raw === '') {
    errorMsg.textContent = 'Please enter a score.';
    return;
  }
  if (isNaN(val) || val < 0 || val > 1) {  // range is 0–1
    errorMsg.textContent = 'Score must be between 0 and 1.';
    return;
  }

  applyScore(val);
}

applyBtn.addEventListener('click', handleApply);
scoreInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleApply(); });