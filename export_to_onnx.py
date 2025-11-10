# export_to_onnx.py
# Recreate model using saved char2idx, load weights, and export to ONNX

import json
import torch
from hybrid_cnn_lstm_phishing import HybridCNNLSTM, MAX_LEN  # import MAX_LEN if declared; else set again

CHAR2IDX_PATH = "char2idx.json"
MODEL_PATH = "hybrid_cnn_lstm_model.pth"
ONNX_OUT = "hybrid_cnn_lstm_model.onnx"

# 1) load char2idx
with open(CHAR2IDX_PATH, "r") as f:
    char2idx = json.load(f)

vocab_size = len(char2idx) + 1  # +1 for padding index 0
print(f"Loaded char2idx (vocab_size={vocab_size})")

# 2) recreate model with the same architecture
# If MAX_LEN is not available in hybrid module, set it here to the same MAX_LEN used in training
try:
    seq_len = MAX_LEN
except NameError:
    seq_len = 100

model = HybridCNNLSTM(vocab_size=vocab_size).to("cpu")

# 3) load weights
state = torch.load(MODEL_PATH, map_location="cpu")
model.load_state_dict(state, strict=True)
model.eval()
print("Model weights loaded successfully.")

# 4) create dummy input of shape (1, seq_len)
dummy_input = torch.randint(0, vocab_size, (1, seq_len), dtype=torch.long)

# 5) export to ONNX
torch.onnx.export(
    model,
    dummy_input,
    ONNX_OUT,
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}},
    opset_version=17
)

print(f"✅ Exported ONNX model to {ONNX_OUT}")
