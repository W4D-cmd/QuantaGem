import os
from pathlib import Path
from huggingface_hub import snapshot_download
import onnxruntime as ort
from tokenizers import Tokenizer
from config import MODEL_ID, MODELS_DIR, STT_THREADS, VARIANT

class VoxtralModel:
    def __init__(self, models_dir: str, variant: str):
        model_path = Path(models_dir) / "voxtral-mini-4b"
        
        options = ort.SessionOptions()
        options.intra_op_num_threads = STT_THREADS
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        self.audio_encoder = ort.InferenceSession(
            str(model_path / "onnx" / f"audio_encoder_{variant}.onnx"), 
            sess_options=options, 
            providers=["CPUExecutionProvider"]
        )
        
        self.decoder = ort.InferenceSession(
            str(model_path / "onnx" / f"decoder_model_merged_{variant}.onnx"), 
            sess_options=options, 
            providers=["CPUExecutionProvider"]
        )
        
        self.embed_tokens = ort.InferenceSession(
            str(model_path / "onnx" / f"embed_tokens_{variant}.onnx"), 
            sess_options=options, 
            providers=["CPUExecutionProvider"]
        )
        
        self.tokenizer = Tokenizer.from_file(str(model_path / "tokenizer.json"))
        
    def inspect_model_io(self):
        print("=== Audio Encoder ===")
        for i in self.audio_encoder.get_inputs():
            print(f"  Input: {i.name} (shape: {i.shape}, type: {i.type})")
        for o in self.audio_encoder.get_outputs():
            print(f"  Output: {o.name} (shape: {o.shape}, type: {o.type})")
            
        print("\n=== Embed Tokens ===")
        for i in self.embed_tokens.get_inputs():
            print(f"  Input: {i.name} (shape: {i.shape}, type: {i.type})")
        for o in self.embed_tokens.get_outputs():
            print(f"  Output: {o.name} (shape: {o.shape}, type: {o.type})")
            
        print("\n=== Decoder ===")
        for i in self.decoder.get_inputs():
            print(f"  Input: {i.name} (shape: {i.shape}, type: {i.type})")
        for o in self.decoder.get_outputs():
            print(f"  Output: {o.name} (shape: {o.shape}, type: {o.type})")

_model_instance = None

def download_model(models_dir: str, variant: str) -> Path:
    target_dir = Path(models_dir) / "voxtral-mini-4b"
    allow_patterns = [
        "config.json",
        "generation_config.json",
        "preprocessor_config.json",
        "processor_config.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "Tekken.json",
        f"onnx/*{variant}*"
    ]
    
    print(f"Downloading model {MODEL_ID} ({variant} variant) to {target_dir}...")
    snapshot_download(
        repo_id=MODEL_ID,
        local_dir=str(target_dir),
        allow_patterns=allow_patterns,
        local_dir_use_symlinks=False
    )
    print("Download complete.")
    return target_dir

def get_model() -> VoxtralModel:
    global _model_instance
    if _model_instance is None:
        _model_instance = VoxtralModel(MODELS_DIR, VARIANT)
    return _model_instance