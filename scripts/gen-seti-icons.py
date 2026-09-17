#!/usr/bin/env python3
"""Bundle VS Code's Seti file-icon theme for the desktop Files tab.

Writes the icon font, its MIT notice, and a compact TypeScript table
(extension -> icon, file name -> icon, icon -> glyph + colours) from the theme
that ships in microsoft/vscode (extensions/theme-seti). Run with a checkout's
theme-seti directory, or with no argument to download the current files.

    python3 scripts/gen-seti-icons.py [path/to/vscode/extensions/theme-seti]
"""
import json
import sys
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FRONTEND = REPO / "desktop" / "frontend"
ASSETS = FRONTEND / "src" / "assets" / "seti"
DATA = FRONTEND / "src" / "components" / "files" / "setiIconData.ts"
UPSTREAM = "https://raw.githubusercontent.com/microsoft/vscode/main/extensions/theme-seti/"

# The theme resolves many types through VS Code language ids rather than file
# extensions; VS Code gets those from its language registry, so map the common
# extensions ourselves.
EXT_TO_LANGUAGE = {
    "js": "javascript", "mjs": "javascript", "cjs": "javascript", "es6": "javascript",
    "jsx": "javascriptreact", "ts": "typescript", "mts": "typescript", "cts": "typescript",
    "tsx": "typescriptreact", "json": "json", "jsonc": "jsonc", "jsonl": "jsonl",
    "md": "markdown", "markdown": "markdown", "mdx": "markdown", "css": "css",
    "pcss": "postcss", "postcss": "postcss", "scss": "scss", "sass": "sass", "less": "less",
    "styl": "stylus", "html": "html", "htm": "html", "xhtml": "html", "py": "python",
    "pyw": "python", "pyi": "python", "rs": "rust", "go": "go", "rb": "ruby",
    "gemspec": "ruby", "rake": "ruby", "erb": "erb", "yml": "yaml", "yaml": "yaml",
    "sh": "shellscript", "bash": "shellscript", "zsh": "shellscript", "fish": "shellscript",
    "xml": "xml", "plist": "xml", "xsd": "xml", "xsl": "xml", "sql": "sql", "java": "java",
    "kt": "kotlin", "kts": "kotlin", "swift": "swift", "c": "c", "h": "c", "cpp": "cpp",
    "cc": "cpp", "cxx": "cpp", "hpp": "cpp", "hh": "cpp", "hxx": "cpp", "m": "objective-c",
    "mm": "objective-cpp", "cs": "csharp", "fs": "fsharp", "fsx": "fsharp", "php": "php",
    "lua": "lua", "pl": "perl", "pm": "perl", "r": "r", "dart": "dart", "groovy": "groovy",
    "gradle": "gradle", "ps1": "powershell", "psm1": "powershell", "bat": "bat", "cmd": "bat",
    "ini": "properties", "cfg": "properties", "conf": "properties",
    "properties": "properties", "env": "dotenv", "dockerfile": "dockerfile",
    "makefile": "makefile", "mk": "makefile", "vue": "vue", "tex": "tex", "elm": "elm",
    "ex": "elixir", "exs": "elixir", "hs": "haskell", "ml": "ocaml", "mli": "ocaml",
    "tf": "terraform", "j2": "jinja", "jinja": "jinja", "hbs": "handlebars",
    "mustache": "mustache", "njk": "nunjucks", "pug": "jade", "jade": "jade", "haml": "haml",
    "clj": "clojure", "cljs": "clojure", "coffee": "coffeescript", "jl": "julia",
    "cu": "cuda-cpp", "bicep": "bicep", "hx": "haxe", "vala": "vala", "res": "rescript",
    "gd": "godot",
}
NAME_TO_LANGUAGE = {
    "dockerfile": "dockerfile", "containerfile": "dockerfile",
    "docker-compose.yml": "dockercompose", "docker-compose.yaml": "dockercompose",
    "compose.yml": "dockercompose", "compose.yaml": "dockercompose",
    "makefile": "makefile", "gnumakefile": "makefile", ".gitignore": "ignore",
    ".gitattributes": "ignore", ".gitmodules": "ignore", ".dockerignore": "ignore",
    ".npmignore": "ignore", ".eslintignore": "ignore", ".prettierignore": "ignore",
    ".env": "dotenv", ".editorconfig": "properties", ".npmrc": "properties",
}


def load(source: str | None) -> tuple[bytes, dict, str]:
    if source:
        base = Path(source)
        font = (base / "icons" / "seti.woff").read_bytes()
        theme = json.loads((base / "icons" / "vs-seti-icon-theme.json").read_text())
        notice = (base / "ThirdPartyNotices.txt").read_text()
        return font, theme, notice
    fetch = lambda name: urllib.request.urlopen(UPSTREAM + name, timeout=30).read()
    return (
        fetch("icons/seti.woff"),
        json.loads(fetch("icons/vs-seti-icon-theme.json")),
        fetch("ThirdPartyNotices.txt").decode(),
    )


def ts_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=True)


def glyph(font_character: str) -> str:
    # The theme writes "\E099"; the table wants the code point as a JS escape.
    return "\\u" + font_character.lstrip("\\").upper().rjust(4, "0")


def main() -> None:
    font, theme, notice = load(sys.argv[1] if len(sys.argv) > 1 else None)
    defs = theme["iconDefinitions"]
    languages = theme["languageIds"]
    exts = dict(theme["fileExtensions"])
    names = dict(theme["fileNames"])
    for ext, language in EXT_TO_LANGUAGE.items():
        if ext not in exts and language in languages:
            exts[ext] = languages[language]
    for name, language in NAME_TO_LANGUAGE.items():
        if name not in names and language in languages:
            names[name] = languages[language]
    default = theme["file"]
    used = sorted(set(exts.values()) | set(names.values()) | {default})

    def entry(icon: str) -> str:
        # A definition without a colour takes the text colour (empty string).
        dark = defs[icon]
        light = defs.get(icon + "_light", dark)
        dark_color = dark.get("fontColor", "")
        light_color = light.get("fontColor", dark_color)
        return f'  {ts_string(icon)}: ["{glyph(dark["fontCharacter"])}", {ts_string(dark_color)}, {ts_string(light_color)}],'

    lines = [
        "// Generated by scripts/gen-seti-icons.py from VS Code's Seti file-icon theme",
        "// (microsoft/vscode, extensions/theme-seti; icons by Jesse Weed's seti-ui,",
        "// MIT — see src/assets/seti/LICENSE.txt). Do not edit by hand.",
        "",
        "// glyph, colour on dark themes, colour on light themes.",
        "export type SetiDef = readonly [glyph: string, dark: string, light: string];",
        "",
        "export const SETI_DEFAULT = " + ts_string(default) + ";",
        "",
        "export const SETI_DEFS: Record<string, SetiDef> = {",
        *[entry(icon) for icon in used],
        "};",
        "",
        "// File extension (longest dotted suffix first) to icon.",
        "export const SETI_EXTENSIONS: Record<string, string> = {",
        *[f"  {ts_string(k)}: {ts_string(v)}," for k, v in sorted(exts.items())],
        "};",
        "",
        "// Whole lower-cased file name to icon.",
        "export const SETI_NAMES: Record<string, string> = {",
        *[f"  {ts_string(k)}: {ts_string(v)}," for k, v in sorted(names.items())],
        "};",
        "",
    ]
    ASSETS.mkdir(parents=True, exist_ok=True)
    (ASSETS / "seti.woff").write_bytes(font)
    (ASSETS / "LICENSE.txt").write_text(notice)
    DATA.write_text("\n".join(lines))
    print(f"{len(used)} icons, {len(exts)} extensions, {len(names)} names -> {DATA.relative_to(REPO)}")
    missing = [e for e in EXT_TO_LANGUAGE if e not in exts]
    if missing:
        print("bridge entries with no theme language:", missing)


if __name__ == "__main__":
    main()
