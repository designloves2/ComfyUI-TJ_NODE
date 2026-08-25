# nodes/utility/prompt_queue.py
# Prompt Queue (TJ) — prompt_count 만큼 prompt_1..N 필드를 노출하고, 큐 자동
# 반복(Start/Stop/Reset)도 이 노드 하나가 직접 지휘한다(Queue Loop 흡수).
#
# 백엔드는 (1) 입력 슬롯 정의, (2) 현재 index에 해당하는 prompt 텍스트 리턴만
# 담당한다. 실제 "실행이 끝나면 다음 프롬프트로 큐를 다시 넣는" 로직은
# web/prompt_queue_tj.js 가 queue_loop_tj.js 와 같은 방식(executing/status
# 웹소켓 이벤트 감지 후 app.queuePrompt 재호출)으로 처리한다 — app.queuePrompt를
# 몽키패치하지 않으므로 Multi Switch의 큐-훅과 충돌하지 않는다.

MAX_PROMPTS = 20


class TJ_PromptQueue:
    @classmethod
    def INPUT_TYPES(cls):
        required = {
            "auto_set": ("BOOLEAN", {"default": True, "label_on": "Auto Set ON", "label_off": "Auto Set OFF"}),
            "prompt_count": ("INT", {"default": 3, "min": 1, "max": MAX_PROMPTS, "step": 1}),
            "current_index": ("INT", {"default": 1, "min": 1, "max": MAX_PROMPTS, "step": 1}),
            "current_queue": ("INT", {"default": 0, "min": 0, "max": MAX_PROMPTS, "step": 1}),
        }
        for i in range(1, MAX_PROMPTS + 1):
            required[f"prompt_{i}"] = ("STRING", {"default": "", "multiline": True})
        return {
            "required": required,
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING", "INT", "INT")
    RETURN_NAMES = ("prompt", "index", "total_count")
    FUNCTION = "run"
    CATEGORY = " ✨ TJ_Node/Utility"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # JS가 실행 사이사이에 current_index/current_queue를 직접 바꾸므로,
        # 캐시된 값을 그대로 재사용하면 안 된다.
        return float("nan")

    def run(self, auto_set=True, prompt_count=3, current_index=1, current_queue=0,
            unique_id=None, **kwargs):
        total = max(1, min(MAX_PROMPTS, int(prompt_count)))
        idx = max(1, min(total, int(current_index)))
        prompt = str(kwargs.get(f"prompt_{idx}", "") or "")
        queue_pos = max(0, int(current_queue))

        ui = {
            "node_id": str(unique_id or ""),
            "index": idx,
            "prompt_count": total,
            "current_queue": queue_pos,
        }
        return {"ui": {"tj_prompt_queue": [ui]}, "result": (prompt, idx, total)}
