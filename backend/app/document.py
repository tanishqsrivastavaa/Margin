from typing import Any

BLOCK_TYPES = {"paragraph", "heading"}


def node_text(node: dict[str, Any]) -> str:
    if node.get("type") == "text":
        return node.get("text", "")
    return "".join(node_text(child) for child in node.get("content", []))


def blocks(doc: dict[str, Any]) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []

    def walk(node: dict[str, Any]) -> None:
        block_id = node.get("attrs", {}).get("id")
        if node.get("type") in BLOCK_TYPES and block_id:
            found.append((block_id, node_text(node)))
            return
        for child in node.get("content", []):
            walk(child)

    walk(doc)
    return found


def neighbors(doc: dict[str, Any], block_id: str) -> tuple[str | None, str | None, str | None]:
    items = blocks(doc)
    for i, (bid, text) in enumerate(items):
        if bid == block_id:
            before = items[i - 1][1] if i > 0 else None
            after = items[i + 1][1] if i + 1 < len(items) else None
            return before, text, after
    return None, None, None
