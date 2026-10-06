# nodes/reflib/encode_cache.py
# Transparent VAE-encode cache for reference media.
#
# The core reference node encodes every reference through vae.encode(pixels) /
# audio_vae.encode(waveform). Those latents do not depend on the prompt, so they are stored
# in <library root>/_cache and read back whenever the same pixels / samples come through the
# same VAE again. Keyed by the exact input bytes, so changed settings (size, trim, mp) or a
# replaced file simply miss. The Qwen3-VL side of a reference is prompt-dependent and is never
# cached.

import hashlib
import os

import torch

from . import library as lib


class CachedVAE:
    def __init__(self, vae):
        self._vae = vae
        model = vae.first_stage_model
        probe = [p.detach().flatten()[:256].float().cpu().sum().item() for _, p in zip(range(4), model.parameters())]
        self._tag = hashlib.sha1(f"{type(model).__name__}|{sum(p.numel() for p in model.parameters())}|{probe}".encode()).hexdigest()[:16]
        self.hits = self.misses = 0

    def __getattr__(self, name):
        return getattr(self._vae, name)

    def _path(self, x):
        h = hashlib.blake2b(digest_size=20)
        h.update(str((tuple(x.shape), str(x.dtype))).encode())
        h.update(x.detach().contiguous().cpu().numpy().tobytes())
        return os.path.join(lib.get_root(), "_cache", self._tag, h.hexdigest() + ".pt")

    def encode(self, x):
        path = self._path(x)
        if os.path.exists(path):
            saved = torch.load(path, map_location="cpu")
            self.hits += 1
            return saved["z"].to(saved["device"])
        z = self._vae.encode(x)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        torch.save({"z": z.detach().cpu(), "device": str(z.device)}, path + ".part")
        os.replace(path + ".part", path)
        self.misses += 1
        return z


def clear():
    root = os.path.join(lib.get_root(), "_cache")
    removed = 0
    for base, _, files in os.walk(root):
        for f in files:
            os.remove(os.path.join(base, f))
            removed += 1
    return removed
