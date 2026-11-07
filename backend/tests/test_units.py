from app.document import neighbors
from app.llm import fold_system
from app.routers.points import parse_detection
from app.rung import RungParser
from tests.conftest import doc


def test_rung_parser_strips_split_tag():
    parser = RungParser(ceiling=3)
    out = "".join(parser.feed(c) for c in ["[ru", "ng:2]", " Try", " this"]) + parser.flush()
    assert out == "Try this"
    assert parser.rung == 2


def test_rung_parser_without_tag():
    parser = RungParser(ceiling=3)
    out = "".join(parser.feed(c) for c in ["What do", " you think?"]) + parser.flush()
    assert out == "What do you think?"
    assert parser.rung is None


def test_parse_detection_handles_noise():
    assert parse_detection('ok {"is_point": true, "summary": " x "}') == (True, "x")
    assert parse_detection("no json") == (False, "")


def test_neighbors():
    d = {"type": "doc", "content": [{"type": "heading", "attrs": {"id": "h"}, "content": [{"type": "text", "text": "T"}]}]}
    d["content"] += doc(("a", "A"), ("b", "B"))["content"]
    assert neighbors(d, "a") == ("T", "A", "B")
    assert neighbors(d, "missing") == (None, None, None)


def test_fold_system():
    folded = fold_system([
        {"role": "system", "content": "S1"},
        {"role": "system", "content": "S2"},
        {"role": "user", "content": "Hi"},
    ])
    assert folded == [{"role": "user", "content": "S1\n\nS2\n\n---\n\nHi"}]
