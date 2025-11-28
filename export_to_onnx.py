import json
import torch
import numpy as np
from hybrid_cnn_lstm_phishing import HybridCNNLSTM, MAX_LEN

# Paths
CHAR2IDX_PATH = "char2idx.json"
PTH_MODEL = "hybrid_cnn_lstm_model.pth"
ONNX_OUT = "hybrid_cnn_lstm_model.onnx"

# Load char2idx
with open(CHAR2IDX_PATH, "r") as f:
    char2idx = json.load(f)

vocab_size = len(char2idx) + 1  # +1 for padding
print("Loaded char2idx. vocab_size =", vocab_size)

# Recreate model
model = HybridCNNLSTM(vocab_size=vocab_size)
model.load_state_dict(torch.load(PTH_MODEL, map_location="cpu"))
model.eval()

print("Loaded .pth model successfully!")

# Dummy input for ONNX export
dummy_input = torch.randint(0, vocab_size, (1, MAX_LEN), dtype=torch.long)

# Export ONNX
torch.onnx.export(
    model,
    dummy_input,
    ONNX_OUT,
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={
        "input": {0: "batch_size"},
        "output": {0: "batch_size"}
    },
    opset_version=17
)

print("✅ Exported ONNX model to:", ONNX_OUT)
