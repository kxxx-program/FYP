# hybrid_cnn_lstm_phishing.py
# Train Hybrid CNN + LSTM on your CSV and save model + char2idx mapping

import os
import json
import pandas as pd
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, TensorDataset

# ---------------------------
# Config
# ---------------------------
CSV_PATH = "URL dataset.csv"   # csv file
MAX_LEN = 100                  # sequence length (characters)
BATCH_SIZE = 64
EPOCHS = 10
LEARNING_RATE = 0.001
MODEL_PATH = "hybrid_cnn_lstm_model.pth"
CHAR2IDX_PATH = "char2idx.json"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ---------------------------
# 1. Load dataset
# ---------------------------
# df = pd.read_csv(CSV_PATH)
# df.columns = [c.lower().strip() for c in df.columns]

# if 'url' not in df.columns or 'type' not in df.columns:
#     raise ValueError("CSV must contain 'url' and 'type' columns.")

# # Map textual labels to binary
# df['type'] = df['type'].astype(str).str.lower().map({'legitimate': 0, 'phishing': 1})
# df = df.dropna(subset=['type'])

CSV_PATH_1 = "URL dataset.csv"
CSV_PATH_2 = "Phishing URLs.csv"

df1 = pd.read_csv(CSV_PATH_1)
df2 = pd.read_csv(CSV_PATH_2)

# Normalize column names
df1.columns = [c.lower().strip() for c in df1.columns]
df2.columns = [c.lower().strip() for c in df2.columns]

# ---- Ensure df1 has correct columns ----
if 'url' not in df1.columns:
    raise ValueError("First CSV must contain a 'url' column.")

if 'type' not in df1.columns:
    raise ValueError("First CSV must contain a 'type' column.")

# ---- Fix df2 column names if different ----
# Common alternative names
rename_map = {}

if 'link' in df2.columns:
    rename_map['link'] = 'url'
if 'label' in df2.columns:
    rename_map['label'] = 'type'
if 'class' in df2.columns:
    rename_map['class'] = 'type'

df2 = df2.rename(columns=rename_map)

# Ensure required columns exist
if 'url' not in df2.columns:
    raise ValueError("Second CSV must contain a URL column (url or link).")

# If type column missing, assume all are phishing
if 'type' not in df2.columns:
    print("Second dataset has no 'type' column → assuming phishing")
    df2['type'] = 'phishing'

# ---- Convert numeric labels to text ----
df2['type'] = df2['type'].astype(str).str.lower().replace({
    '1': 'phishing',
    '0': 'legitimate',
    'yes': 'phishing',
    'no': 'legitimate'
})

# ---- Merge datasets ----
df = pd.concat([df1, df2], ignore_index=True)

# Clean labels
df['type'] = df['type'].astype(str).str.lower().map({
    'legitimate': 0,
    'benign': 0,
    'safe': 0,
    'phishing': 1,
    'malicious': 1
})

df = df.dropna(subset=['url', 'type'])

print("Total samples after merge:", len(df))
print(df['type'].value_counts())

# ---------------------------
# 2. Build char2idx (vocabulary)
# ---------------------------
all_chars = sorted(list(set("".join(df['url'].astype(str).values))))
# Reserve 0 for padding
char2idx = {c: i + 1 for i, c in enumerate(all_chars)}  # indices start at 1
vocab_size = len(char2idx) + 1  # +1 because index 0 is padding

print(f"Unique chars: {len(all_chars)}, vocab_size (for embedding): {vocab_size}")

# Save mapping for later (export / inference)
with open(CHAR2IDX_PATH, "w") as f:
    json.dump(char2idx, f)
print(f"Saved char2idx mapping to {CHAR2IDX_PATH}")

# ---------------------------
# 3. Preprocessing: encode URLs
# ---------------------------
def encode_url(url, max_len=MAX_LEN):
    url = str(url)
    seq = [char2idx.get(c, 0) for c in url[:max_len]]  # unknown chars -> 0
    if len(seq) < max_len:
        seq += [0] * (max_len - len(seq))
    return seq

X = np.array([encode_url(u, MAX_LEN) for u in df['url']])
y = np.array(df['type'], dtype=np.float32)

# ---------------------------
# 4. Train/test split & DataLoader
# ---------------------------
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

X_train_t = torch.tensor(X_train, dtype=torch.long)
y_train_t = torch.tensor(y_train, dtype=torch.float32)
X_test_t = torch.tensor(X_test, dtype=torch.long)
y_test_t = torch.tensor(y_test, dtype=torch.float32)

train_loader = DataLoader(TensorDataset(X_train_t, y_train_t), batch_size=BATCH_SIZE, shuffle=True)
test_loader = DataLoader(TensorDataset(X_test_t, y_test_t), batch_size=BATCH_SIZE, shuffle=False)

print(f"Training samples: {len(X_train)}, Testing samples: {len(X_test)}")

# ---------------------------
# 5. Model Definition
# ---------------------------
class HybridCNNLSTM(nn.Module):
    def __init__(self, vocab_size, embed_dim=64, hidden_dim=64):
        super(HybridCNNLSTM, self).__init__()
        # vocab_size is the number of embedding rows (including padding index 0)
        self.embedding = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
        self.conv1 = nn.Conv1d(in_channels=embed_dim, out_channels=128, kernel_size=5, padding=2)
        self.relu = nn.ReLU()
        self.pool = nn.MaxPool1d(kernel_size=2)
        self.lstm = nn.LSTM(128, hidden_dim, batch_first=True, bidirectional=True)
        self.fc = nn.Linear(hidden_dim * 2, 1)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        # x shape: (batch, seq_len)
        x = self.embedding(x)                     # (batch, seq_len, embed_dim)
        x = x.permute(0, 2, 1)                    # (batch, embed_dim, seq_len)
        x = self.pool(self.relu(self.conv1(x)))   # (batch, channels, seq_len/2)
        x = x.permute(0, 2, 1)                    # (batch, seq_len/2, channels)
        _, (h_n, _) = self.lstm(x)               # h_n shape: (num_layers*2, batch, hidden_dim)
        h = torch.cat((h_n[-2], h_n[-1]), dim=1)  # concat forward & backward
        out = self.sigmoid(self.fc(h)).squeeze(1) # shape: (batch,)
        return out

# ---------------------------
# 6. Instantiate model, loss, optimizer
# ---------------------------
model = HybridCNNLSTM(vocab_size=vocab_size).to(DEVICE)
criterion = nn.BCELoss()
optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE)

# ---------------------------
# 7. Training loop
# ---------------------------
for epoch in range(1, EPOCHS + 1):
    model.train()
    running_loss = 0.0
    for Xb, yb in train_loader:
        Xb, yb = Xb.to(DEVICE), yb.to(DEVICE)
        optimizer.zero_grad()
        outputs = model(Xb)
        loss = criterion(outputs, yb)
        loss.backward()
        optimizer.step()
        running_loss += loss.item() * Xb.size(0)
    epoch_loss = running_loss / len(train_loader.dataset)
    print(f"Epoch {epoch}/{EPOCHS} - Loss: {epoch_loss:.4f}")

# ---------------------------
# 8. Evaluation on test set
# ---------------------------
model.eval()
correct = 0
total = 0
with torch.no_grad():
    for Xb, yb in test_loader:
        Xb, yb = Xb.to(DEVICE), yb.to(DEVICE)
        outputs = model(Xb)
        preds = (outputs > 0.5).float()
        correct += (preds == yb).sum().item()
        total += yb.size(0)

acc = correct / total * 100
print(f"Test Accuracy: {acc:.2f}%")

# ---------------------------
# 9. Save model and mapping
# ---------------------------
torch.save(model.state_dict(), MODEL_PATH)
print(f"Saved model weights to {MODEL_PATH}")

# char2idx already saved above. Print path to confirm.
print(f"Character mapping saved to {CHAR2IDX_PATH}")

# When finished, optionally print a couple of examples
print("Example encoded URL (first train sample):")
print(X_train[0][:50])

