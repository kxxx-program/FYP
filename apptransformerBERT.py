import json
import torch
import torch.nn as nn
import pandas as pd
import tldextract
from flask import Flask, request, jsonify
from flask_cors import CORS 
from thefuzz import fuzz

# ================= CONFIG =================
CSV1 = "URL dataset.csv"
CSV2 = "Phishing URLs.csv"
MODEL_PATH = "transformer_model.pth"
CHAR2IDX_PATH = "char2idx.json"
MAX_LEN = 120
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ================= 1. THE THREAT ENGINE =================
def load_threat_engine():
    df1 = pd.read_csv(CSV1)
    df2 = pd.read_csv(CSV2)
    df1.columns = [c.lower().strip() for c in df1.columns]
    df2.columns = [c.lower().strip() for c in df2.columns]
    df2 = df2.rename(columns={"link": "url", "class": "type", "label": "type"})
    
    df = pd.concat([df1, df2], ignore_index=True)
    df["url_clean"] = df["url"].astype(str).str.lower().str.strip()
    
    lookup = pd.Series(df.type.values, index=df.url_clean).to_dict()
    
    legit_df = df[df['type'].isin(['legitimate', 'benign', 'safe', '0'])]
    safe_domains = set()
    for u in legit_df["url_clean"]:
        ext = tldextract.extract(u)
        if ext.registered_domain:
            safe_domains.add(ext.registered_domain)
            
    return lookup, safe_domains

url_lookup, safe_domains_list = load_threat_engine()

# ================= 2. TRANSFORMER MODEL =================
with open(CHAR2IDX_PATH, "r") as f:
    char2idx = json.load(f)

class URLTransformer(nn.Module):
    def __init__(self, vocab_size):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, 128, padding_idx=0)
        encoder_layer = nn.TransformerEncoderLayer(d_model=128, nhead=4, dim_feedforward=256, batch_first=True)
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=2)
        self.fc = nn.Linear(128, 1)
    def forward(self, x):
        x = self.embedding(x)
        x = self.transformer(x)
        return self.fc(x.mean(dim=1)).squeeze(1)

model = URLTransformer(len(char2idx) + 1).to(DEVICE)
model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
model.eval()

# ================= 3. UPDATED INSPECTION LOGIC =================
def safe_browsing_inspect(raw_url):
    clean_url = raw_url.lower().replace("http://", "").replace("https://", "").strip()
    ext = tldextract.extract(raw_url)
    current_domain = ext.registered_domain
    
    # 1. Exact Database Match (Highest Priority)
    if clean_url in url_lookup:
        label = url_lookup[clean_url].lower()
        if label in ["legitimate", "benign", "safe", "0"]:
            return "Legitimate", 1.0, "Verified safe by database."
        return "Phishing", 1.0, "CRITICAL: Known malicious URL!"

    # 2. Domain & Path Heuristics
    if current_domain:
        # Check for keywords anywhere in the path
        phish_hints = ["login", "verify", "sign-in", "secure", "account", "update"]
        has_phish_keyword = any(word in clean_url for word in phish_hints)

        if current_domain in safe_domains_list:
            # NEW RULE: If it's a trusted domain but has a deep, messy path with 'login' 
            # and isn't in our exact 'Safe' database, we flag it as High Risk.
            path_depth = clean_url.count('/')
            if has_phish_keyword and path_depth >= 2:
                return "High Risk", 0.85, f"Suspicious login path detected on {current_domain}."
            
            # Standard safe domain check
            return "Legitimate", 0.95, f"Trusted domain: {current_domain}"

        # Typo Detection for unknown domains
        for safe_d in safe_domains_list:
            similarity = fuzz.ratio(current_domain, safe_d)
            if 88 <= similarity < 100:
                return "High Risk", 0.98, f"LINK TYPO: '{current_domain}' is imitating '{safe_d}'."

    # 3. AI Transformer Analysis (Last Resort)
    seq = [char2idx.get(c, 0) for c in clean_url[:MAX_LEN]]
    seq += [0] * (MAX_LEN - len(seq))
    with torch.no_grad():
        x_input = torch.tensor([seq], dtype=torch.long).to(DEVICE)
        prob = torch.sigmoid(model(x_input)).item()
    
    if prob < 0.20: return "Legitimate", round(prob, 2), "AI: Likely safe."
    if prob < 0.70: return "Moderate Risk", round(prob, 2), "AI: Potential threat patterns."
    return "Phishing", round(prob, 2), "AI: Malicious signature detected."

# ================= 4. FLASK SERVER =================
app = Flask(__name__)
CORS(app)

@app.route("/", methods=["GET"])
def home():
    return jsonify({"status": "Safe Browsing API Online"})

@app.route("/check_url", methods=["POST"])
def check_url():
    data = request.get_json()
    if not data or "url" not in data:
        return jsonify({"error": "No URL provided"}), 400

    url = data.get("url")
    risk_level, confidence, message = safe_browsing_inspect(url)

    return jsonify({
        "url": url,
        "risk_level": risk_level,
        "confidence": confidence,
        "message": message,
        "is_safe": risk_level in ["Legitimate", "Low Risk", "Moderate Risk"]
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)