"""Build a self-contained verification console using the Python standard library."""

import argparse
import base64
import json
from pathlib import Path
import re

DEMO = Path(__file__).resolve().parents[1]
PROJECT = DEMO.parent
LOCAL_IMPORT = re.compile(
    r"(?P<head>\bfrom\s+|\bimport\s+|\bimport\(\s*)(?P<quote>['\"])(?P<path>\.{1,2}/[^'\"\n]+)(?P=quote)"
    r"""(?:\s+with\s*\{\s*type\s*:\s*['"]json['"]\s*\})?"""
)


def pack_module(path, imports):
    path = path.resolve()
    name = "trust404/" + path.relative_to(PROJECT).as_posix()
    if path.suffix == ".json":
        name += ".mjs"
    if name in imports:
        return name
    imports[name] = ""

    def replace(match):
        dependency = pack_module(path.parent / match["path"], imports)
        return match["head"] + json.dumps(dependency)

    source = path.read_text(encoding="utf-8")
    if path.suffix == ".json":
        # JSON module loads use connect-src in Chromium. Embed fixture JSON as
        # a local JS module so the standalone can keep its no-network policy.
        data = json.dumps(json.loads(source), ensure_ascii=False, separators=(",", ":"))
        code = "export default " + data + ";"

    else:
        code = LOCAL_IMPORT.sub(replace, source)
    encoded = base64.b64encode(code.encode("utf-8")).decode("ascii")
    imports[name] = "data:text/javascript;base64," + encoded
    return name


def build(output):
    imports = {}
    entry = pack_module(DEMO / "app.js", imports)
    import_map = json.dumps({"imports": imports}, separators=(",", ":"))
    script = '<script type="importmap">' + import_map + '</script>\n'
    script += '<script type="module">import ' + json.dumps(entry) + ';</script>'
    page = (DEMO / "index.html").read_text(encoding="utf-8")
    css = (DEMO / "app.css").read_text(encoding="utf-8")
    page = page.replace('<link rel="stylesheet" href="app.css">', '<style>\n' + css + '</style>')
    page = page.replace('<script type="module" src="app.js"></script>', script)
    page = page.replace('<meta charset="utf-8">', '''<meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' data:; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">''')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(page, encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="Path for the offline HTML file")
    build(parser.parse_args().output)
