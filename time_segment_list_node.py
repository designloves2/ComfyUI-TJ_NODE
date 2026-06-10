import math


class TimeSegmentListNode:
    """
    Creates overlapped time segments in seconds.

    Example:
      start_sec = 8
      duration_sec = 20
      overlap_sec = 3

      1: 8  -> 28
      2: 25 -> 45
      3: 42 -> 62
    """

    CATEGORY = " ✨ TJ_Node/Utility"
    RETURN_TYPES = ("STRING", "INT")
    RETURN_NAMES = ("segment_list", "segment_count")
    FUNCTION = "make_segments"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "start_sec": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 999999,
                    "step": 1,
                }),
                "duration_sec": ("INT", {
                    "default": 20,
                    "min": 1,
                    "max": 999999,
                    "step": 1,
                }),
                "total_sec": ("INT", {
                    "default": 120,
                    "min": 1,
                    "max": 999999,
                    "step": 1,
                }),
            },
            "optional": {
                "overlap_sec": ("INT", {
                    "default": 3,
                    "min": 0,
                    "max": 999999,
                    "step": 1,
                }),
                "include_over_total": (["true", "false"], {
                    "default": "true",
                }),
                "format_mode": (["range_only", "with_formula", "csv"], {
                    "default": "with_formula",
                }),
            },
        }

    def make_segments(
        self,
        start_sec,
        duration_sec,
        total_sec,
        overlap_sec=3,
        include_over_total="true",
        format_mode="with_formula",
    ):
        start_sec = int(start_sec)
        duration_sec = int(duration_sec)
        total_sec = int(total_sec)
        overlap_sec = int(overlap_sec)

        step = duration_sec - overlap_sec
        if step <= 0:
            text = (
                "ERROR: duration_sec must be greater than overlap_sec.\n"
                f"duration_sec={duration_sec}, overlap_sec={overlap_sec}"
            )
            return (text, 0)

        if total_sec < start_sec:
            return ("No segments: total_sec is smaller than start_sec.", 0)

        segments = []
        idx = 1
        current_start = start_sec

        while True:
            current_end = current_start + duration_sec

            if include_over_total == "true":
                if current_start >= total_sec:
                    break
            else:
                if current_end > total_sec:
                    break

            segments.append((idx, current_start, current_end))
            idx += 1
            current_start = start_sec + step * (idx - 1)

            if idx > 100000:
                break

        if not segments:
            return ("No segments generated.", 0)

        lines = []

        if format_mode == "csv":
            lines.append("index,start_sec,end_sec")
            for idx, s, e in segments:
                lines.append(f"{idx},{s},{e}")

        elif format_mode == "range_only":
            for idx, s, e in segments:
                lines.append(f"{idx}. {s} - {e} sec")

        else:
            lines.append(f"start_sec={start_sec}, duration_sec={duration_sec},")
            lines.append(f"overlap_sec={overlap_sec}, total_sec={total_sec}")
            lines.append("")

            for idx, s, e in segments:
                lines.append(f"{idx}. {s} - {e} sec")

        return ("\n".join(lines), len(segments))


NODE_CLASS_MAPPINGS = {
    "TimeSegmentListNode": TimeSegmentListNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "TimeSegmentListNode": "Time Segment List (TJ)",
}