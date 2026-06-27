# nodes/utility/save_text_file.py

import os
import re
from datetime import datetime

import folder_paths

from ._utility_utils import _tj_safe_output_dir, _tj_expand_datetime_aliases


class TJ_SaveTextFile:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"forceInput": True}),
                "get_name": (["(none)"],),
                "setnode_name": ("STRING", {"default": ""}),
                "path": ("STRING", {"default": "image/%date"}),
                "filename_prefix": ("STRING", {"default": "image"}),
                "filename_delimiter": ("STRING", {"default": "_"}),
                "filename_number_padding": ("INT", {"default": 4, "min": 0, "max": 12, "step": 1}),
                "file_extension": ("STRING", {"default": ".txt"}),
                "encoding": (["utf-8", "utf-8-sig", "cp949", "euc-kr", "ascii"], {"default": "utf-8"}),
                "filename_suffix": ("STRING", {"default": ""}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "process"
    CATEGORY = " ✨ TJ_Node/Utility"
    OUTPUT_NODE = True

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @staticmethod
    def _clean_ext(file_extension):
        ext = str(file_extension or ".txt").strip()
        if not ext:
            ext = ".txt"
        if not ext.startswith("."):
            ext = "." + ext
        ext = re.sub(r"[\\/:*?\"<>|\s]+", "", ext)
        return ext or ".txt"

    @staticmethod
    def _safe_name_part(value, fallback="text"):
        s = str(value if value is not None else "").strip()
        if not s:
            s = fallback
        s = s.replace("\\", "_").replace("/", "_")
        s = re.sub(r"[\r\n\t]+", " ", s)
        s = re.sub(r"[<>:\"|?*]+", "_", s)
        s = s.strip(" .")
        return s or fallback

    @staticmethod
    def _next_filename(out_dir, prefix, delimiter, padding, suffix, ext):
        padding = max(0, int(padding or 0))
        number_re = r"(\d+)" if padding <= 0 else rf"(\d{{{padding},}})"
        pattern = re.compile(
            rf"^{re.escape(prefix)}{re.escape(delimiter)}{number_re}{re.escape(suffix)}{re.escape(ext)}$",
            re.IGNORECASE,
        )
        max_num = 0
        try:
            for fn in os.listdir(out_dir):
                m = pattern.match(fn)
                if m:
                    max_num = max(max_num, int(m.group(1)))
        except Exception:
            pass
        next_num = max_num + 1
        number = str(next_num) if padding <= 0 else f"{next_num:0{padding}d}"
        return f"{prefix}{delimiter}{number}{suffix}{ext}"

    def process(
        self,
        text,
        get_name,
        setnode_name,
        path,
        filename_prefix,
        filename_delimiter,
        filename_number_padding,
        file_extension,
        encoding,
        filename_suffix,
    ):
        now = datetime.now()
        parsed_path = now.strftime(_tj_expand_datetime_aliases(path))
        parsed_prefix = now.strftime(_tj_expand_datetime_aliases(filename_prefix))
        parsed_delimiter = now.strftime(_tj_expand_datetime_aliases(filename_delimiter))
        parsed_suffix = now.strftime(_tj_expand_datetime_aliases(filename_suffix))

        out_dir = _tj_safe_output_dir(parsed_path)
        os.makedirs(out_dir, exist_ok=True)

        prefix = self._safe_name_part(parsed_prefix, "text")
        delimiter = self._safe_name_part(parsed_delimiter, "") if parsed_delimiter else ""
        suffix = self._safe_name_part(parsed_suffix, "") if parsed_suffix else ""
        ext = self._clean_ext(file_extension)
        enc = str(encoding or "utf-8").strip() or "utf-8"

        filename = self._next_filename(out_dir, prefix, delimiter, filename_number_padding, suffix, ext)
        file_path = os.path.join(out_dir, filename)

        out_text = "" if text is None else str(text)
        with open(file_path, "w", encoding=enc, newline="") as f:
            f.write(out_text)

        try:
            subfolder = os.path.relpath(out_dir, folder_paths.get_output_directory())
            if subfolder == ".":
                subfolder = ""
        except Exception:
            subfolder = ""

        return {
            "ui": {"tj_text_file": [{"filename": filename, "subfolder": subfolder, "type": "output"}]},
            "result": (out_text,),
        }
