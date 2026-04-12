import json
import pandas as pd
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
import torch.onnx
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, TensorDataset

# ================= CONFIG =================
CSV1 = "URL dataset.csv"
CSV2 = "Phishing URLs.csv"

MAX_LEN = 120
BATCH_SIZE = 64
EPOCHS = 30
LR = 0.0005

MODEL_PATH = "transformer_model.pth"
CHAR2IDX_PATH = "char2idx.json"

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ================= LOAD DATA =================
df1 = pd.read_csv(CSV1)
df2 = pd.read_csv(CSV2)

df1.columns = [c.lower().strip() for c in df1.columns]
df2.columns = [c.lower().strip() for c in df2.columns]

df2 = df2.rename(columns={"link": "url", "class": "type", "label": "type"})

if "type" not in df2.columns:
    df2["type"] = "phishing"

df = pd.concat([df1, df2], ignore_index=True)

# ================= CLEAN =================
df["url"] = df["url"].astype(str).str.lower().str.strip()
df["url"] = df["url"].str.replace("http://", "", regex=False)
df["url"] = df["url"].str.replace("https://", "", regex=False)

df["type"] = df["type"].astype(str).str.lower().str.strip()

df["label"] = df["type"].map({
    "legitimate": 0,
    "benign": 0,
    "safe": 0,
    "0": 0,
    "phishing": 1,
    "malicious": 1,
    "1": 1
})

df = df.dropna(subset=["url", "label"])
df["label"] = df["label"].astype(int)
df = df.drop_duplicates(subset="url")

print("Dataset size:", len(df))
print(df["label"].value_counts())

# ================= VOCAB =================
all_chars = sorted(set("".join(df["url"])))
char2idx = {c: i + 1 for i, c in enumerate(all_chars)}

with open(CHAR2IDX_PATH, "w") as f:
    json.dump(char2idx, f)

vocab_size = len(char2idx) + 1

# ================= ENCODE =================
def encode(url):
    seq = [char2idx.get(c, 0) for c in url[:MAX_LEN]]
    if len(seq) < MAX_LEN:
        seq += [0] * (MAX_LEN - len(seq))
    return seq

X = np.array([encode(u) for u in df["url"]])
y = np.array(df["label"], dtype=np.float32)

# ================= SPLIT =================
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, stratify=y, random_state=42
)

train_loader = DataLoader(
    TensorDataset(torch.tensor(X_train, dtype=torch.long),
                  torch.tensor(y_train, dtype=torch.float32)),
    batch_size=BATCH_SIZE, shuffle=True
)

test_loader = DataLoader(
    TensorDataset(torch.tensor(X_test, dtype=torch.long),
                  torch.tensor(y_test, dtype=torch.float32)),
    batch_size=BATCH_SIZE
)

# ================= POSITIONAL ENCODING =================
class PositionalEncoding(nn.Module):
    def __init__(self, d_model, max_len=MAX_LEN):
        super().__init__()
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len).unsqueeze(1)

        div_term = torch.exp(torch.arange(0, d_model, 2) * (-np.log(10000.0) / d_model))

        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)

        self.pe = pe.unsqueeze(0)

    def forward(self, x):
        return x + self.pe[:, :x.size(1)].to(x.device)

# ================= TRANSFORMER MODEL =================
class URLTransformer(nn.Module):
    def __init__(self, vocab_size):
        super().__init__()

        self.embedding = nn.Embedding(vocab_size, 128, padding_idx=0)
        self.pos_encoder = PositionalEncoding(128)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=128,
            nhead=4,
            dim_feedforward=256,
            dropout=0.2,
            batch_first=True
        )

        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=2)

        self.dropout = nn.Dropout(0.3)
        self.fc = nn.Linear(128, 1)

    def forward(self, x):
        x = self.embedding(x)             # (B, L, 128)
        x = self.pos_encoder(x)

        x = self.transformer(x)           # (B, L, 128)

        x = x.mean(dim=1)                 # global pooling

        x = self.dropout(x)
        return self.fc(x).squeeze(1)      # logits

model = URLTransformer(vocab_size).to(DEVICE)

# ================= LOSS =================
phish = (df["label"] == 1).sum()
legit = (df["label"] == 0).sum()

pos_weight = torch.tensor([legit / phish]).to(DEVICE)

criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
optimizer = optim.Adam(model.parameters(), lr=LR)

# ================= TRAIN =================
for epoch in range(EPOCHS):
    model.train()
    total_loss = 0

    for Xb, yb in train_loader:
        Xb, yb = Xb.to(DEVICE), yb.to(DEVICE)

        optimizer.zero_grad()
        logits = model(Xb)
        loss = criterion(logits, yb)

        loss.backward()
        optimizer.step()

        total_loss += loss.item() * Xb.size(0)

    print(f"Epoch {epoch+1}/{EPOCHS} Loss: {total_loss / len(train_loader.dataset):.4f}")

# ================= TEST =================
model.eval()
correct = total = 0

with torch.no_grad():
    for Xb, yb in test_loader:
        Xb, yb = Xb.to(DEVICE), yb.to(DEVICE)

        probs = torch.sigmoid(model(Xb))
        preds = (probs > 0.5).float()

        correct += (preds == yb).sum().item()
        total += yb.size(0)

print("Test Accuracy:", round(correct / total * 100, 2), "%")

# SAVE
torch.save(model.state_dict(), MODEL_PATH)
print("✅ Transformer model saved!")

import pickle
import pandas as pd

# Load your CSVs (same as training)
CSV1 = "URL dataset.csv"
CSV2 = "Phishing URLs.csv"

df1 = pd.read_csv(CSV1)
df2 = pd.read_csv(CSV2)

# unify column names
df1.columns = [c.lower().strip() for c in df1.columns]
df2.columns = [c.lower().strip() for c in df2.columns]

df2 = df2.rename(columns={"link": "url", "label": "type", "class": "type"})

df = pd.concat([df1, df2], ignore_index=True)
df["url"] = df["url"].astype(str).str.lower().str.strip()

# save set of all URLs
all_urls_set = set(df["url"].tolist())

with open("all_urls.pkl", "wb") as f:
    pickle.dump(all_urls_set, f)

print(f"Saved {len(all_urls_set)} URLs to all_urls.pkl")

# Export to ONNX
ONNX_MODEL_PATH = "transformer_model.onnx"

print("Exporting model to ONNX format")

model.eval()

dummy_input = torch.zeros(1, MAX_LEN, dtype=torch.long).to(DEVICE)

torch.onnx.export(
    model,
    dummy_input,
    ONNX_MODEL_PATH,
    export_params=True,
    opset_version=11,
    input_names=['input'],
    output_names=['output']
)

print(f"✅ ONNX model successfully saved to {ONNX_MODEL_PATH}!")