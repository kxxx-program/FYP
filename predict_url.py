import json
import torch
import torch.nn as nn

MODEL_PATH = "hybrid_cnn_lstm_model.pth"
CHAR2IDX_PATH = "char2idx.json"
MAX_LEN = 100
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

#load char2idx
with open(CHAR2IDX_PATH, "r") as f:
    char2idx = json.load(f)

vocab_size = len(char2idx) + 1

# model definition (same with training)
class HybridCNNLSTM(nn.Module):
    def __init__(self, vocab_size, embed_dim=64, hidden_dim=64):
        super(HybridCNNLSTM, self).__init__()
        self.embedding = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
        self.conv1 = nn.Conv1d(embed_dim, 128, kernel_size=5, padding=2)
        self.relu = nn.ReLU()
        self.pool = nn.MaxPool1d(2)
        self.lstm = nn.LSTM(128, hidden_dim, batch_first=True, bidirectional=True)
        self.fc = nn.Linear(hidden_dim * 2, 1)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        x = self.embedding(x)
        x = x.permute(0, 2, 1)
        x = self.pool(self.relu(self.conv1(x)))
        x = x.permute(0, 2, 1)
        _, (h_n, _) = self.lstm(x)
        h = torch.cat((h_n[-2], h_n[-1]), dim=1)
        out = self.sigmoid(self.fc(h)).squeeze(1)
        return out

#load trained model
model = HybridCNNLSTM(vocab_size).to(DEVICE)
model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
model.eval()

#encode url
def encode_url(url):
    seq = [char2idx.get(c, 0) for c in url[:MAX_LEN]]
    if len(seq) < MAX_LEN:
        seq += [0] * (MAX_LEN - len(seq))
    return torch.tensor(seq, dtype=torch.long).unsqueeze(0).to(DEVICE)

#test url
url = input("Enter URL: ")

with torch.no_grad():
    x = encode_url(url)
    prob = model(x).item()

if prob > 0.5:
    print(f"!!!Dangerous!!! It might be a phishing link (Confidence: {prob:.4f})")
else:
    print(f"Legitimate link (Confidence: {prob:.4f})")