import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Comfy.TJ_Nodes_Extension",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        
        // 1. 기존 표준형 다이나믹 배치 노드 처리
        if (nodeData.name === "DynamicImageBatch") {
            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function (type, index, connected, link_info, input_info) {
                if (onConnectionsChange) onConnectionsChange.apply(this, arguments);

                if (type === 1) { 
                    const lastInput = this.inputs[this.inputs.length - 1];
                    if (lastInput && lastInput.link !== null) {
                        const nextNum = this.inputs.length + 1;
                        this.addInput(`image_${nextNum}`, "IMAGE");
                    }
                    for (let i = this.inputs.length - 1; i > 0; i--) {
                        if (this.inputs[i].link === null && this.inputs[i - 1].link === null) {
                            this.removeInput(i);
                        }
                    }
                }
            };
        }

        // 2. 이클립스 대용량 멀티 채널 노드 처리 (와일드카드 핀 생성 적용)
        if (nodeData.name === "DynamicImageBatchEclipse") {
            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function (type, index, connected, link_info, input_info) {
                if (onConnectionsChange) onConnectionsChange.apply(this, arguments);

                if (type === 1) { 
                    const lastInput = this.inputs[this.inputs.length - 1];
                    if (lastInput && lastInput.link !== null) {
                        const nextNum = Math.floor(this.inputs.length / 2) + 1;
                        this.addInput(`image_${nextNum}`, "IMAGE");
                        this.addInput(`files_${nextNum}`, "*"); // 여기를 와일드카드(*)로 맞춤 변경
                    }
                    for (let i = this.inputs.length - 1; i > 1; i -= 2) {
                        if (this.inputs[i].link === null && this.inputs[i-1].link === null &&
                            this.inputs[i-2].link === null && this.inputs[i-3].link === null) {
                            this.removeInput(i);   
                            this.removeInput(i-1); 
                        }
                    }
                }
            };
        }
    }
});
