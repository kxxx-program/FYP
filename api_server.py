from flask import Flask, request, jsonify
import onnxruntime as ort
import json
import numpy as np

#load model
session = ort.InferenceSession("hybrid_cnn_lstm_model.onnx")

#load char2idx
with open("char2idx.json", "r") as f:
    char2idx = json.load(f)

MAX_LEN = 100

def encode_url(url):
    seq = [char2idx.get(c, 1) for c in url[:MAX_LEN]] # 1 = unknown char
    seq += [0] * (MAX_LEN - len(seq))
    return np.array([seq], dtype=np.int64)

app = Flask(__name__)

@app.route("/check_url", methods=["POST"])
def check_url():
    data = request.json
    url = data["url"]

    x = encode_url(url)
    pred = session.run(None, {"input": x})[0]
    result = "phishing" if pred[0][0] > 0.5 else "legitimate"

    return jsonify({"url": url, "result": result})

app.run(host="0.0.0.0, port=5000")