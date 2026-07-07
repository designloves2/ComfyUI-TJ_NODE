# nodes/utility/queue_loop.py

class TJ_QueueLoop:
    """Queue Loop (TJ)

    Runs the workflow repeatedly as separate queue executions.
    The node outputs the current index first; the frontend increments the
    queue counter and next index only after the current workflow execution
    finishes, then queues the next run when enabled.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "auto_set": ("BOOLEAN", {"default": True, "label_on": "Auto Set ON", "label_off": "Auto Set OFF"}),
                "queue_count": ("INT", {"default": 50, "min": 1, "max": 1000000, "step": 1}),
                "current_index": ("INT", {"default": 1, "min": 1, "max": 1000000, "step": 1}),
                "current_queue": ("INT", {"default": 0, "min": 0, "max": 1000000, "step": 1}),
                "start_index": ("INT", {"default": 1, "min": 1, "max": 1000000, "step": 1}),
                "end_index": ("INT", {"default": 4, "min": 1, "max": 1000000, "step": 1}),
                "step": ("INT", {"default": 1, "min": 1, "max": 1000000, "step": 1}),
                "index_loop_mode": (["Index Stop at End", "Index Loop"], {"default": "Index Loop"}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("INT", "STRING", "INT")
    RETURN_NAMES = ("index", "index_text", "queue_count")
    FUNCTION = "run"
    CATEGORY = " ✨ TJ_Node/Utility"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        return True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # The JS side mutates current_index/current_queue between queued runs.
        # Returning NaN keeps ComfyUI from serving cached values during repeats.
        return float("nan")

    def run(
        self,
        auto_set=True,
        queue_count=50,
        current_index=0,
        current_queue=0,
        start_index=0,
        end_index=4,
        step=1,
        index_loop_mode="Index Loop",
        unique_id=None,
        # Backward compatibility for old workflow JSON / older node versions.
        total_count=None,
        loop_mode=None,
    ):
        if total_count is not None:
            queue_count = total_count
        if loop_mode is not None and index_loop_mode in (None, ""):
            index_loop_mode = "Index Loop" if str(loop_mode) == "Loop" else "Index Stop at End"

        total = max(1, int(queue_count))
        start = max(1, int(start_index))
        end = max(start, int(end_index))
        step_value = max(1, int(step))
        queue_pos = max(0, int(current_queue))
        mode = str(index_loop_mode or "Index Loop")

        index = max(1, int(current_index))
        if mode == "Index Loop":
            if index < start or index > end:
                index = start
        else:
            if index < start:
                index = start
            if index > end:
                index = end

        ui = {
            "node_id": str(unique_id or ""),
            "index": index,
            "index_text": str(index),
            "queue_count": total,
            "current_queue": queue_pos,
            "start_index": start,
            "end_index": end,
            "step": step_value,
            "index_loop_mode": mode,
        }
        return {"ui": {"tj_queue_loop": [ui]}, "result": (index, str(index), total)}
