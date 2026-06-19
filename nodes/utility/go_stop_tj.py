import time
from aiohttp import web
from server import PromptServer
from comfy.model_management import InterruptProcessingException


class AnyType(str):
    def __ne__(self, _: object) -> bool:
        return False


any_type = AnyType("*")


class TJ_GoStop:
    """Go & Stop (TJ) - single ANY pass-through pause gate."""

    status_by_id = {}

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "in_1": (any_type,),
                "get_name": ("STRING", {"default": "", "multiline": False}),
                "set_name": ("STRING", {"default": "", "multiline": False}),
                "sound_notice": ("BOOLEAN", {"default": False}),
            },
            "hidden": {
                "id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("out_1",)
    FUNCTION = "execute"
    CATEGORY = " ✨ TJ_Node/Utility"
    OUTPUT_NODE = True

    def execute(self, in_1=None, get_name="", set_name="", sound_notice=False, id=None):
        node_id = str(id)
        self.status_by_id[node_id] = "waiting"
        PromptServer.instance.send_sync(
            "tj_go_stop_waiting",
            {
                "node_id": node_id,
                "get_name": get_name or "",
                "set_name": set_name or "",
                "sound_notice": bool(sound_notice),
            },
        )

        try:
            while self.status_by_id.get(node_id) == "waiting":
                time.sleep(0.1)

            if self.status_by_id.get(node_id) == "stopped":
                raise InterruptProcessingException()

            return {"result": (in_1,)}
        finally:
            self.status_by_id.pop(node_id, None)


@PromptServer.instance.routes.post("/tj_go_stop/go/{node_id}")
async def tj_go_stop_go(request):
    node_id = request.match_info["node_id"].strip()
    TJ_GoStop.status_by_id[node_id] = "go"
    return web.json_response({"status": "ok"})


@PromptServer.instance.routes.post("/tj_go_stop/stop/{node_id}")
async def tj_go_stop_stop(request):
    node_id = request.match_info["node_id"].strip()
    TJ_GoStop.status_by_id[node_id] = "stopped"
    return web.json_response({"status": "ok"})


@PromptServer.instance.routes.post("/tj_go_stop/stop")
async def tj_go_stop_stop_all(_request):
    for node_id in list(TJ_GoStop.status_by_id.keys()):
        TJ_GoStop.status_by_id[node_id] = "stopped"
    return web.json_response({"status": "ok"})
