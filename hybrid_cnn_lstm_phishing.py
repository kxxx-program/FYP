import json
import pandas as pd
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, TensorDataset

# Configuration, combine csv1 and 2, compare when algorithm running
CSV1 = "URL dataset.csv"
CSV2 = "Phishing URLs.csv"
MAX_LEN = 100
BATCH_SIZE = 64
EPOCHS = 30
LR = 0.001
MODEL_PATH = "hybrid_cnn_lstm_model.pth"
CHAR2IDX_PATH = "char2idx.json"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Load datasets
df1 = pd.read_csv(CSV1)
df2 = pd.read_csv(CSV2)

df1.columns = [c.lower().strip() for c in df1.columns]
df2.columns = [c.lower().strip() for c in df2.columns]

df2 = df2.rename(columns={"link": "url", "label": "type", "class": "type"})

if "type" not in df2.columns:
    df2["type"] = "phishing"

df = pd.concat([df1, df2], ignore_index=True)

# Clean labels
df["url"] = df["url"].astype(str).str.lower().str.strip()
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

# remove duplicates
df = df.drop_duplicates(subset="url")

print("Dataset size:", len(df))
print(df["label"].value_counts())

# Build vocabulary
all_chars = sorted(set("".join(df["url"])))
char2idx = {c: i + 1 for i, c in enumerate(all_chars)}
vocab_size = len(char2idx) + 1

with open(CHAR2IDX_PATH, "w") as f:
    json.dump(char2idx, f)

# Encode URLs
def encode(url):
    seq = [char2idx.get(c, 0) for c in url[:MAX_LEN]]
    if len(seq) < MAX_LEN:
        seq += [0] * (MAX_LEN - len(seq))
    return seq

X = np.array([encode(u) for u in df["url"]])
y = np.array(df["label"], dtype=np.float32)

# Train/Test split
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

# Model
class HybridCNNLSTM(nn.Module):
    def __init__(self, vocab_size):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, 128, padding_idx=0)
        self.conv = nn.Conv1d(128, 256, kernel_size=5, padding=2)
        self.pool = nn.MaxPool1d(2)
        self.relu = nn.ReLU()

        self.lstm = nn.LSTM(
            256, 128,
            batch_first=True,
            bidirectional=True,
            num_layers=2
        )

        self.dropout = nn.Dropout(0.3)
        self.fc = nn.Linear(256, 1)

    def forward(self, x):
        x = self.embedding(x)
        x = x.permute(0, 2, 1)
        x = self.pool(self.relu(self.conv(x)))
        x = x.permute(0, 2, 1)

        _, (h, _) = self.lstm(x)
        h = torch.cat((h[-2], h[-1]), dim=1)
        h = self.dropout(h)

        return self.fc(h).squeeze(1)

model = HybridCNNLSTM(vocab_size).to(DEVICE)

# Loss (handle imbalance)
phish = (df["label"] == 1).sum()
legit = (df["label"] == 0).sum()

pos_weight = torch.tensor([legit / phish]).to(DEVICE)

criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
optimizer = optim.Adam(model.parameters(), lr=LR)

# Training
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

# Evaluation
model.eval()
correct = total = 0

with torch.no_grad():
    for Xb, yb in test_loader:
        Xb, yb = Xb.to(DEVICE), yb.to(DEVICE)
        probs = torch.sigmoid(model(Xb))
        preds = (probs > 0.5).float()

        correct += (preds == yb).sum().item()
        total += yb.size(0)

print("Test Accuracy:", correct / total * 100)

# Save
torch.save(model.state_dict(), MODEL_PATH)
print("Model saved:", MODEL_PATH)