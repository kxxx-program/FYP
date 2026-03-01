import json
import torch
import torch.nn as nn

MODEL_PATH = "hybrid_cnn_lstm_model.pth"
CHAR2IDX_PATH = "char2idx.json"
MAX_LEN = 120
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Load vocab
with open(CHAR2IDX_PATH, "r") as f:
    char2idx = json.load(f)

vocab_size = len(char2idx) + 1

# SAME MODEL STRUCTURE
class MultiKernelCNN_LSTM(nn.Module):
    def __init__(self, vocab_size):
        super().__init__()

        self.embedding = nn.Embedding(vocab_size, 128, padding_idx=0)

        self.conv3 = nn.Conv1d(128, 128, kernel_size=3, padding=1)
        self.conv5 = nn.Conv1d(128, 128, kernel_size=5, padding=2)
        self.conv7 = nn.Conv1d(128, 128, kernel_size=7, padding=3)

        self.relu = nn.ReLU()
        self.pool = nn.MaxPool1d(2)

        self.lstm = nn.LSTM(
            384, 128,
            batch_first=True,
            bidirectional=True,
            num_layers=2
        )

        self.dropout = nn.Dropout(0.3)
        self.fc = nn.Linear(256, 1)

    def forward(self, x):
        x = self.embedding(x)
        x = x.permute(0, 2, 1)

        x1 = self.relu(self.conv3(x))
        x2 = self.relu(self.conv5(x))
        x3 = self.relu(self.conv7(x))

        x = torch.cat([x1, x2, x3], dim=1)

        x = self.pool(x)
        x = x.permute(0, 2, 1)

        _, (h, _) = self.lstm(x)
        h = torch.cat((h[-2], h[-1]), dim=1)

        h = self.dropout(h)
        return self.fc(h).squeeze(1)

model = MultiKernelCNN_LSTM(vocab_size).to(DEVICE)
model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
model.eval()

def encode(url):
    seq = [char2idx.get(c, 0) for c in url[:MAX_LEN]]
    if len(seq) < MAX_LEN:
        seq += [0] * (MAX_LEN - len(seq))
    return torch.tensor(seq, dtype=torch.long).unsqueeze(0).to(DEVICE)

while True:
    url = input("Enter URL (or q to quit): ")
    if url.lower() == "q":
        break

    with torch.no_grad():
        prob = torch.sigmoid(model(encode(url))).item()

    if prob > 0.5:
        print(f"⚠️ PHISHING (Confidence: {prob:.4f})")
    else:
        print(f"✅ LEGITIMATE (Confidence: {prob:.4f})")