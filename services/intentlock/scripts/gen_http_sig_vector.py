"""Write data/eval/http_sig_vector.json (RFC 9421 reference vector for the TS signer)."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.crypto.vector import build_vector  # noqa: E402

out = Path(__file__).resolve().parents[3] / "data" / "eval" / "http_sig_vector.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(build_vector(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {out}")
