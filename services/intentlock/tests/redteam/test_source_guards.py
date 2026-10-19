"""Guarantees that hold by construction, checked against the source so they stay true (threats 14, 15, 17,
19, 20, 22, 28, 32)."""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
REPO = ROOT.parents[1]
sys.path.insert(0, str(ROOT))

DANGEROUS_CALLS = {"eval", "exec", "compile", "__import__"}
DANGEROUS_ATTRS = {("os", "system"), ("os", "popen"), ("pickle", "loads"), ("pickle", "load"), ("yaml", "load"),
                   ("marshal", "loads")}


def _calls(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            f = node.func
            if isinstance(f, ast.Name):
                yield f.id, None, node
            elif isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name):
                yield f.value.id, f.attr, node


def test_no_code_execution_on_input():
    """No eval/exec/pickle/shell anywhere in the API; subprocess only reads the git SHA with fixed arguments."""
    for path in (ROOT / "app").rglob("*.py"):
        tree = ast.parse(path.read_text(), str(path))
        for base, attr, node in _calls(tree):
            assert not (attr is None and base in DANGEROUS_CALLS), f"{path}:{node.lineno} {base}()"
            assert (base, attr) not in DANGEROUS_ATTRS, f"{path}:{node.lineno} {base}.{attr}()"
            if base == "subprocess":
                assert path.name == "main.py", f"{path}:{node.lineno} subprocess outside main._git_sha"
                assert isinstance(node.args[0], ast.List) and all(isinstance(e, ast.Constant) for e in node.args[0].elts)
                assert not any(k.arg == "shell" for k in node.keywords)


def test_agent_tools_are_a_fixed_allow_list():
    """The shopping agent can search, read a public page, build a cart, check out through Sepilo and propose a
    slot. No refunds, no admin, no email, no code execution, no browser automation (threats 18-20, 22, 32)."""
    tools = (REPO / "apps/agent/src/tools.ts").read_text()
    ids = set(re.findall(r'^\s*id:\s*"([a-z_]+)"', tools, re.M))
    assert ids == {"search_products", "get_product", "read_page", "build_cart", "checkout", "propose_slot"}
    assert "fetchPublicPage(url)" in tools  # read_page is SSRF-guarded
    deps = json.loads((REPO / "apps/agent/package.json").read_text()).get("dependencies", {})
    banned = ("playwright", "puppeteer", "selenium", "@modelcontextprotocol", "child_process", "shelljs")
    assert not [d for d in deps if any(b in d for b in banned)]


def test_agent_memory_is_session_only():
    """No persistent agent memory to poison (threat 14): the Astropods agent's memory is in-process only, and
    the hosted Sepilo agent keeps none (chat context comes from the API per request)."""
    index = (REPO / "apps/agent/agent/index.ts").read_text()
    assert 'url: ":memory:"' in index
    for name in ("server.ts", "suggest.ts", "shop.ts"):
        assert "Memory" not in (REPO / "apps/agent/src" / name).read_text()


def test_no_shared_writable_knowledge_store():
    """No RAG store or shared blackboard agents can write to (threats 15, 17): product facts come from Channel3
    at request time, and no route lets an agent write catalog or rules."""
    from app.main import app

    client = TestClient(app, raise_server_exceptions=False)
    for method, path in (("POST", "/mandates"), ("PATCH", "/mandates/x"), ("POST", "/agents"),
                         ("POST", "/schedule/sync"), ("POST", "/lab/reset")):
        assert client.request(method, path, json={}).status_code == 401, path


def test_agent_signature_cannot_reach_user_or_operator_routes(db):
    """An agent's own key can't create agents, rules or sessions (unauthorized delegation, threat 28)."""
    from app.crypto.http_sig import sign_request
    from app.crypto.keys import generate_keypair_b64
    from app.db import get_db
    from app.ids import new_id
    from app.main import app
    from app.models import Agent, User

    priv, pub = generate_keypair_b64()
    u = User(id=new_id("usr"), name="Dana")
    db.add(u)
    db.flush()
    a = Agent(id=new_id("agt"), user_id=u.id, name="worker", public_key=pub, device_id="d", verified=True)
    db.add(a)
    db.commit()
    app.dependency_overrides[get_db] = lambda: db
    try:
        c = TestClient(app, raise_server_exceptions=False)
        for path, body in (("/agents", {"user_id": u.id, "name": "child", "public_key": pub}),
                           ("/me/agents", {"name": "child", "public_key": pub}),
                           ("/mandates", {"agent_id": a.id}), ("/me/mandates", {"agent_id": a.id})):
            raw = json.dumps(body).encode()
            h = sign_request("POST", f"http://testserver{path}", raw, priv, a.id)
            assert c.post(path, content=raw, headers=h).status_code == 401, path
    finally:
        app.dependency_overrides.pop(get_db, None)
