import pandas as pd
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
from torch.utils.data import DataLoader, TensorDataset

# Load and Preprocess Dataset
df = pd.read_csv("URL dataset.csv")

df.columns = [col.lower().strip() for col in df.columns]

if 'url' not in df.columns or 'type' not in df.columns:
    raise ValueError("CSV must contain 'url' and 'type' columns.")

df['type'] = df['type'].str.lower().map({'legitimate': 0, 'phishing': 1})
df = df.dropna(subset=['type'])

all_chars = set(''.join(df['url'].astype(str).values))
char2idx = {c: i + 1 for i, c in enumerate(sorted(all_chars))}
max_len = 100

def encode_url(url):
    url = str(url)
    encoded = [char2idx.get(c, 0) for c in url[:max_len]]
    if len(encoded) < max_len:
        encoded += [0] * (max_len - len(encoded))
    return encoded

X = np.array([encode_url(u) for u in df['url']])
y = np.array(df['type'], dtype=np.float32)

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

X_train = torch.tensor(X_train, dtype=torch.long)
y_train = torch.tensor(y_train, dtype=torch.float32)
X_test = torch.tensor(X_test, dtype=torch.long)
y_test = torch.tensor(y_test, dtype=torch.float32)

train_loader = DataLoader(TensorDataset(X_train, y_train), batch_size=64, shuffle=True)
test_loader = DataLoader(TensorDataset(X_test, y_test), batch_size=64, shuffle=False)

print(f"✅ Training samples: {len(X_train)}, Testing samples: {len(X_test)}")

# Define Hybrid CNN + LSTM Model
class HybridCNNLSTM(nn.Module):
    def __init__(self, vocab_size, embed_dim=64, hidden_dim=64, num_classes=1):
        super(HybridCNNLSTM, self).__init__()
        self.embedding = nn.Embedding(vocab_size + 1, embed_dim, padding_idx=0)
        self.conv1 = nn.Conv1d(embed_dim, 128, kernel_size=5, padding=2)
        self.relu = nn.ReLU()
        self.pool = nn.MaxPool1d(2)
        self.lstm = nn.LSTM(128, hidden_dim, batch_first=True, bidirectional=True)
        self.fc = nn.Linear(hidden_dim * 2, num_classes)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        x = self.embedding(x)
        x = x.permute(0, 2, 1)
        x = self.pool(self.relu(self.conv1(x)))
        x = x.permute(0, 2, 1)
        _, (h_n, _) = self.lstm(x)
        h = torch.cat((h_n[-2], h_n[-1]), dim=1)
        out = self.sigmoid(self.fc(h))
        return out.squeeze()

# Train Model
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = HybridCNNLSTM(vocab_size=len(char2idx)).to(device)
criterion = nn.BCELoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)

epochs = 10
for epoch in range(epochs):
    model.train()
    total_loss = 0
    for X_batch, y_batch in train_loader:
        X_batch, y_batch = X_batch.to(device), y_batch.to(device)
        optimizer.zero_grad()
        outputs = model(X_batch)
        loss = criterion(outputs, y_batch)
        loss.backward()
        optimizer.step()
        total_loss += loss.item()
    print(f"Epoch [{epoch+1}/{epochs}] - Loss: {total_loss/len(train_loader):.4f}")


# Evaluate Model + Classification Report
model.eval()
y_true = []
y_pred = []

with torch.no_grad():
    for X_batch, y_batch in test_loader:
        X_batch = X_batch.to(device)
        outputs = model(X_batch)
        preds = (outputs.cpu() > 0.5).int()
        y_pred.extend(preds.numpy())
        y_true.extend(y_batch.numpy())

print("\n===== Classification Report =====")
print(classification_report(y_true, y_pred, target_names=["Legitimate", "Phishing"]))

print("\n===== Confusion Matrix =====")
print(confusion_matrix(y_true, y_pred))

# save train model

model_path = "hybrid_cnn_lstm_model.pth"
torch.save(model.state_dict(), model_path)
print(f"\n✅ Model saved successfully as '{model_path}'")
