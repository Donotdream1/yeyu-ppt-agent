"""Run the pinned upstream's pure, read-only JSON checks; no Office process control."""
import importlib.util
import json
from pathlib import Path
import sys
from types import SimpleNamespace

source = Path(__file__).parent / 'vendor' / 'harness-anything-office' / 'quality_checks.py'
spec = importlib.util.spec_from_file_location('upstream_harness_quality', source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
request = json.load(sys.stdin)
report = module.review_deck(request['slides'], SimpleNamespace(rules={'max_bullets': 6, 'visual_ratio': .5}))
print(json.dumps({'upstream': report, 'dimensions': module.REVIEW_DIMENSIONS}, ensure_ascii=False))
