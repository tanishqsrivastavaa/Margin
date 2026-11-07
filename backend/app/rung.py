import re

TAG = re.compile(r"^\s*\[rung:\s*([1-4])\]")


class RungParser:
    def __init__(self, ceiling: int) -> None:
        self.ceiling = ceiling
        self.rung: int | None = None
        self.buffer = ""
        self.done = False
        self.started = False

    def feed(self, chunk: str) -> str:
        if self.done:
            return self._emit(chunk)
        self.buffer += chunk
        if match := TAG.match(self.buffer):
            self.rung = min(int(match.group(1)), self.ceiling)
            return self._release(self.buffer[match.end():])
        if "]" in self.buffer or len(self.buffer) > 16:
            return self._release(self.buffer)
        return ""

    def flush(self) -> str:
        return "" if self.done else self._release(self.buffer)

    def _release(self, text: str) -> str:
        self.done = True
        self.buffer = ""
        return self._emit(text)

    def _emit(self, text: str) -> str:
        if not self.started:
            text = text.lstrip()
            self.started = bool(text)
        return text
