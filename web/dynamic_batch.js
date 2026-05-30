import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "Comfy.TJ_Nodes_Extension",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {

        // TJ 노드 및 특정 다이나믹 배치 노드들을 모두 감지
        const customNodes = ["DynamicImageBatch", "DynamicImageBatchEclipse", "TJ_BatchToMultiOutput"];
        
        const isTJNode = customNodes.includes(nodeData.name) || 
                         (typeof nodeData.name === "string" && nodeData.name.includes("TJ")) || 
                         (typeof nodeType.title === "string" && nodeType.title.includes("TJ"));

        if (isTJNode) {
            // ★ 핵심: 맨 앞에 공백(" ")을 하나 추가했습니다!
            // 공백은 정렬 순위가 A보다 앞서기 때문에 무조건 리스트 최상단에 고정됩니다.
            nodeData.category = " ✨ TJ Nodes";

            const origOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);
                
                const applyColors = () => {
                    this.bgcolor = "#000000";
                    this.color = "#7612DA";
                    this.title_text_color = "#FFFFFF";
                };

                // 즉시 적용
                applyColors();
                // LiteGraph 기본 테마 등에 의해 덮어씌워지는 것 방지
                requestAnimationFrame(() => applyColors());
            };
        }
        
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

        // 2. 이클립스 대용량 멀티 채널 노드 처리
        if (nodeData.name === "DynamicImageBatchEclipse") {
            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function (type, index, connected, link_info, input_info) {
                if (onConnectionsChange) onConnectionsChange.apply(this, arguments);

                if (type === 1) { 
                    const lastInput = this.inputs[this.inputs.length - 1];
                    if (lastInput && lastInput.link !== null) {
                        const nextNum = Math.floor(this.inputs.length / 2) + 1;
                        this.addInput(`image_${nextNum}`, "IMAGE");
                        this.addInput(`files_${nextNum}`, "*");
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

        // 3. Batch to Multi Image Output — 동적 출력 슬롯
        if (nodeData.name === "TJ_BatchToMultiOutput") {

            // out_count에 맞게 출력 슬롯 개수 조정
            function updateOutputSlots(node) {
                const outCountWidget = node.widgets ? node.widgets.find(w => w.name === "out_count") : null;
                if (!outCountWidget) return;

                const desired = Math.max(1, Math.min(64, parseInt(outCountWidget.value) || 2));
                const current = node.outputs ? node.outputs.length : 0;

                if (current === desired) return;

                if (current < desired) {
                    // 슬롯 추가
                    for (let i = current; i < desired; i++) {
                        node.addOutput(`IMAGE_${i + 1}`, "IMAGE");
                    }
                } else {
                    // 슬롯 제거 (뒤에서부터, 연결 없는 것만)
                    for (let i = current - 1; i >= desired; i--) {
                        // 연결이 있으면 끊기
                        if (node.outputs[i] && node.outputs[i].links && node.outputs[i].links.length > 0) {
                            // 연결된 링크들 제거
                            const links = [...node.outputs[i].links];
                            for (const linkId of links) {
                                node.graph.removeLink(linkId);
                            }
                        }
                        node.removeOutput(i);
                    }
                }

                node.setSize(node.computeSize());
                node.setDirtyCanvas(true, true);
            }

            // 노드 생성 시
            const origOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);

                const self = this;

                // 초기 출력 슬롯을 기본값(2개)으로 설정
                // ComfyUI가 RETURN_TYPES 기반으로 64개를 자동 생성하므로 초과분 제거
                requestAnimationFrame(() => {
                    updateOutputSlots(self);
                });

                // out_count 위젯 콜백
                const outCountWidget = this.widgets ? this.widgets.find(w => w.name === "out_count") : null;
                if (outCountWidget) {
                    const origCallback = outCountWidget.callback;
                    outCountWidget.callback = function (v) {
                        if (origCallback) origCallback.call(this, v);
                        updateOutputSlots(self);
                    };
                }
            };

            // 워크플로우 로드 시
            const origOnConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function (data) {
                if (origOnConfigure) origOnConfigure.call(this, data);
                const self = this;
                requestAnimationFrame(() => {
                    updateOutputSlots(self);
                });
            };
        }
    }
});