from flask import Flask, request, jsonify
import torch
import torch.nn as nn
import json

MODEL_PATH = "hybrid_cnn_lstm_model.pth"
CHAR2IDX_PATH = "char2idx.json"
MAX_LEN = 120

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

app = Flask(__name__)

#load char2idx
with open(CHAR2IDX_PATH, "r") as f:
    char2idx = json.load(f)

vocab_size = len(char2idx) + 1

#model
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
        x = self.embedding(x)      # (B, L, 128)
        x = x.permute(0, 2, 1)     # (B, 128, L)

        x1 = self.relu(self.conv3(x))
        x2 = self.relu(self.conv5(x))
        x3 = self.relu(self.conv7(x))

        x = torch.cat([x1, x2, x3], dim=1)  # (B, 384, L)

        x = self.pool(x)
        x = x.permute(0, 2, 1)     # (B, L/2, 384)

        _, (h, _) = self.lstm(x)
        
        # --- FIXED SECTION FOR ONNX COMPATIBILITY ---
        # h shape: (num_layers * num_directions, batch, hidden_size) -> (4, B, 128)
        # Use positive indices and explicit slicing to help the ONNX tracer
        h_forward = h[2, :, :]  # Forward direction, last layer
        h_backward = h[3, :, :] # Backward direction, last layer
        
        # Concatenate on dim 1 to get (B, 256)
        h = torch.cat((h_forward, h_backward), dim=1)
        # --------------------------------------------

        h = self.dropout(h)
        return self.fc(h).squeeze(1)

#load model
model = MultiKernelCNN_LSTM(vocab_size)
model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
model.eval()

#encode function
def encode_url(url):
    seq = [char2idx.get(c,0) for c in url[:MAX_LEN]]
    if len(seq) < MAX_LEN:
        seq += [0] * (MAX_LEN - len(seq))
    return torch.tensor(seq, dtype=torch.long).unsqueeze(0)

#API route
@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json()

    if "url" not in data:
        return jsonify({"error": "No URL provided"}), 400
    
    url = data["url"]

    with torch.no_grad():
        x = encode_url(url)
        logits = model(x)
        prob = torch.sigmoid(logits).item()

    result = "phishing" if prob > 0.5 else "legitimate"

    return jsonify({
        "url": url,
        "prediction": result,
        "confidence": round(prob, 4)
    })

#run server
if __name__ == "__main__":
    app.run(debug=True)