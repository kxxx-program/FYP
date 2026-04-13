let ortSession = null;
let char2idx = {};
const MAX_LEN = 120; 

async function initModel() {
    const status = document.getElementById("loadingStatus");
    status.textContent = "Loading model files...";

    try {
  
        const vocabRes = await fetch(chrome.runtime.getURL("model/char2idx.json"));
        char2idx = await vocabRes.json();

        const modelUrl = chrome.runtime.getURL("model/transformer_model.onnx");
        const dataUrl  = chrome.runtime.getURL("model/transformer_model.onnx.data");

        const [modelBuffer, dataBuffer] = await Promise.all([
            fetch(modelUrl).then(r => r.arrayBuffer()),
            fetch(dataUrl).then(r => r.arrayBuffer())
        ]);

        ortSession = await ort.InferenceSession.create(modelBuffer, {
            executionProviders: ["wasm"],
            externalData: [
                {
                    path: "transformer_model.onnx.data",
                    data: new Uint8Array(dataBuffer)
                }
            ]
        });

        status.textContent = "Model ready.";
    } catch (err) {
        console.error("Initialization failed:", err);
        status.textContent = "Error loading model. Check console.";
    }
}


function getRiskLevel(score) {
    if (score <= 0.25) return "1 (Safe)";
    if (score <= 0.46) return "2 (Low)";
    if (score <= 0.70) return "3 (Moderate)";
    return "4 (High)";
}

async function analyzeUrl(url) {
    if (!ortSession) return;

   
    const cleanUrl = url.toLowerCase().replace(/^https?:\/\//, "");
    const padded = new Array(MAX_LEN).fill(0);
    Array.from(cleanUrl).slice(0, MAX_LEN).forEach((c, i) => {
        padded[i] = char2idx[c] || 0;
    });

    const inputTensor = new ort.Tensor("int64", BigInt64Array.from(padded.map(BigInt)), [1, MAX_LEN]);
    const results = await ortSession.run({ input: inputTensor });

    const logit = Number(results["output"].data[0]);
    const confidence = 1 / (1 + Math.exp(-logit)); // Sigmoid calculation

    return {
        score: confidence,
        level: getRiskLevel(confidence)
    };
}

document.getElementById("runTest").addEventListener("click", async () => {
    const url = document.getElementById("testUrl").value.trim();
    if (!url) return;

    const resultDiv = document.getElementById("testResult");
    const scoreSpan = document.getElementById("resScore");
    const levelSpan = document.getElementById("resLevel");

    const result = await analyzeUrl(url);
    
    scoreSpan.textContent = result.score.toFixed(4);
    levelSpan.textContent = result.level;
    resultDiv.style.display = "block";
});


initModel();