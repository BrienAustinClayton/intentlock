"""Graph store interface and the NetworkX implementation.

A Neo4j implementation (P2-T12) plugs in behind the same ``GraphStore`` interface.
Node ids are plain strings; every node has a ``type`` attribute
(user | agent | device | key | merchant | mandate | order).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from collections import deque
from typing import Any, Iterable

import networkx as nx


class GraphStore(ABC):
    @abstractmethod
    def upsert_node(self, node_id: str, type: str, **attrs: Any) -> None: ...

    @abstractmethod
    def upsert_edge(self, src: str, dst: str, type: str, **attrs: Any) -> None: ...

    @abstractmethod
    def neighbors(
        self, node_id: str, edge_type: str | None = None, direction: str = "both"
    ) -> list[str]: ...

    @abstractmethod
    def subgraph(self, order_id: str, hops: int = 2) -> dict[str, Any]: ...

    @abstractmethod
    def get_node(self, node_id: str) -> dict[str, Any] | None: ...

    @abstractmethod
    def nodes(self, type: str | None = None) -> list[str]: ...

    @abstractmethod
    def edges(
        self, node_id: str, edge_type: str | None = None, direction: str = "out"
    ) -> list[dict[str, Any]]: ...


class NetworkXStore(GraphStore):
    """In-memory MultiDiGraph; edges are keyed by type so upserts are idempotent."""

    def __init__(self) -> None:
        self.g: nx.MultiDiGraph = nx.MultiDiGraph()

    def copy(self) -> "NetworkXStore":
        other = NetworkXStore()
        other.g = self.g.copy()
        return other

    def upsert_node(self, node_id: str, type: str, **attrs: Any) -> None:
        if node_id in self.g:
            self.g.nodes[node_id].update(attrs)
            self.g.nodes[node_id]["type"] = type
        else:
            self.g.add_node(node_id, type=type, **attrs)

    def upsert_edge(self, src: str, dst: str, type: str, **attrs: Any) -> None:
        for n in (src, dst):
            if n not in self.g:
                self.g.add_node(n, type="unknown")
        if self.g.has_edge(src, dst, key=type):
            self.g.edges[src, dst, type].update(attrs)
        else:
            self.g.add_edge(src, dst, key=type, type=type, **attrs)

    def has_node(self, node_id: str) -> bool:
        return node_id in self.g

    def get_node(self, node_id: str) -> dict[str, Any] | None:
        if node_id not in self.g:
            return None
        return {"id": node_id, **self.g.nodes[node_id]}

    def nodes(self, type: str | None = None) -> list[str]:
        return [n for n, d in self.g.nodes(data=True) if type is None or d.get("type") == type]

    def edges(
        self, node_id: str, edge_type: str | None = None, direction: str = "out"
    ) -> list[dict[str, Any]]:
        if node_id not in self.g:
            return []
        out: list[dict[str, Any]] = []
        if direction in ("out", "both"):
            for s, d, _k, data in self.g.out_edges(node_id, keys=True, data=True):
                if edge_type is None or data.get("type") == edge_type:
                    out.append({"source": s, "target": d, **data})
        if direction in ("in", "both"):
            for s, d, _k, data in self.g.in_edges(node_id, keys=True, data=True):
                if edge_type is None or data.get("type") == edge_type:
                    out.append({"source": s, "target": d, **data})
        return out

    def neighbors(
        self, node_id: str, edge_type: str | None = None, direction: str = "both"
    ) -> list[str]:
        seen: dict[str, None] = {}
        for e in self.edges(node_id, edge_type, direction):
            other = e["target"] if e["source"] == node_id else e["source"]
            seen.setdefault(other, None)
        return list(seen)

    def subgraph(self, order_id: str, hops: int = 2) -> dict[str, Any]:
        if order_id not in self.g:
            return {"nodes": [], "edges": []}
        dist = {order_id: 0}
        q: deque[str] = deque([order_id])
        while q:
            cur = q.popleft()
            if dist[cur] >= hops:
                continue
            for nb in self.neighbors(cur):
                if nb not in dist:
                    dist[nb] = dist[cur] + 1
                    q.append(nb)
        keep = set(dist)
        nodes = [{"id": n, **self.g.nodes[n]} for n in keep]
        edges = [
            {"source": s, "target": d, **data}
            for s, d, _k, data in self.g.edges(keys=True, data=True)
            if s in keep and d in keep
        ]
        return {"nodes": nodes, "edges": edges}


def uniq(items: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(items))
