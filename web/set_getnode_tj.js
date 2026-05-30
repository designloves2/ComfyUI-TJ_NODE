// web/set_getnode_tj.js
// "투명 선(Invisible Wire)" 패러다임 + 글로벌 서브메뉴 (더블클릭 네비게이션 제거)

import { app } from "../../scripts/app.js";

const LGraphNode = LiteGraph.LGraphNode;
const MAX_PORTS = 20;

let globalShowWire = false; 

const origRenderLink = LGraphCanvas.prototype.renderLink;
LGraphCanvas.prototype.renderLink = function(ctx, a, b, link, skip_border, flow, color, start_dir, end_dir, num_sublines) {
	if (link && this.graph) {
		const origin = this.graph.getNodeById(link.origin_id);
		const target = this.graph.getNodeById(link.target_id);
		
		const isSetSource = origin && (origin.type === "TJ_SetNode" || origin.type === "TJ_MultiRouter");
		const isGetter = target && (target.type === "TJ_GetNode" || target.type === "TJ_MultiGetNode");
		
		if (isSetSource && isGetter) {
			if (globalShowWire || origin.properties?.show_wire || target.properties?.show_wire) {
				ctx.save();
				ctx.setLineDash([2, 5]); 
				
				const originalWidth = this.connections_width;
				this.connections_width = 2; 
				
				const origLinkColor = link.color;
				link.color = "#ffff00"; 
				
				const args = Array.from(arguments);
				args[6] = "#ffff00"; 
				
				const res = origRenderLink.apply(this, args);
				
				link.color = origLinkColor;
				this.connections_width = originalWidth;
				
				ctx.restore();
				return res;
			}
			return; 
		}
	}
	return origRenderLink.apply(this, arguments);
};

const origDrawNode = LGraphCanvas.prototype.drawNode;
LGraphCanvas.prototype.drawNode = function(node, ctx) {
	if (node.type === "TJ_GetNode" || node.type === "TJ_MultiGetNode") {
		if (node.inputs) {
			node.inputs.forEach(inp => {
				if (!inp._tj_real_name) inp._tj_real_name = inp.name;
				inp.label = ""; 
			});
		}
	}
	return origDrawNode.apply(this, arguments);
};

function getAllSetNames(graph) {
	if (!graph) return ["(none)"];
	const names = [];
	graph._nodes.forEach(n => {
		if (n.type === "TJ_SetNode") {
			const val = n.widgets?.find(x => x.name === "set_name")?.value;
			if (val) names.push(val);
		} else if (n.type === "TJ_MultiRouter" && n.properties && n.properties.auto_sets) {
			const autoSetW = n.widgets?.find(w => w.name === "auto_set");
			if (!autoSetW || autoSetW.value) { 
				Object.values(n.properties.auto_sets).forEach(val => { 
					if (val && val.trim() !== "") names.push(val); 
				});
			}
		}
	});
	return ["(none)", ...new Set(names)].sort();
}

function findSetterSourceInfo(graph, setName) {
	if (!setName || setName === "(none)") return null;
	for (const n of graph._nodes) {
		if (n.type === "TJ_SetNode") {
			if (n.widgets?.find(w => w.name === "set_name")?.value === setName) {
				return { node: n, slot: 0 };
			}
		}
		else if (n.type === "TJ_MultiRouter" && n.properties?.auto_sets) {
			const autoSetW = n.widgets?.find(w => w.name === "auto_set");
			if (autoSetW && !autoSetW.value) continue;
			
			for (const [idxStr, autoName] of Object.entries(n.properties.auto_sets)) {
				if (autoName === setName) {
					return { node: n, slot: parseInt(idxStr) }; 
				}
			}
		}
	}
	return null;
}

function getTypeColor(type) {
	if (!type || type === "*") return null;
	return app.canvas?.default_connection_color_byType?.[type] || LGraphCanvas?.link_type_colors?.[type] || null;
}

function darkenHex(hex, factor) {
	if (!hex) return null;
	let h = hex.replace("#", "");
	if (h.length === 3) h = h.split("").map(c => c + c).join("");
	const r = Math.max(0, Math.round(parseInt(h.substring(0, 2), 16) * factor));
	const g = Math.max(0, Math.round(parseInt(h.substring(2, 4), 16) * factor));
	const b = Math.max(0, Math.round(parseInt(h.substring(4, 6), 16) * factor));
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

app.registerExtension({
	name: "TJ.SetNode.Wireless",
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		if (nodeData.name === "TJ_SetNode") {
			const origOnNodeCreated = nodeType.prototype.onNodeCreated;
			nodeType.prototype.onNodeCreated = function() {
				if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);

                this.bgcolor = "#000000";
                this.color = "#7612DA";
                this.title_text_color = "#FFFFFF";

				const w = this.widgets.find(w => w.name === "set_name");
				if (w) {
					w.callback = () => {
						this.title = "SET: " + w.value;
						app.graph._nodes.forEach(n => {
							if (n.type === "TJ_GetNode" && n._syncWithSetNode) n._syncWithSetNode();
							// Set 노드 이름 변경 시 Multi Get 노드 동기화 호출
							if (n.type === "TJ_MultiGetNode") {
								if (n._syncWithSetNodes) n._syncWithSetNodes();
								else if (n._rebuild) n._rebuild();
							}
						});
						app.canvas.setDirty(true, true);
					};
				}
				this.title = "SET: " + (w ? w.value : "TJ_Set_1");
			};

			const origOnConnectionsChange = nodeType.prototype.onConnectionsChange;
			nodeType.prototype.onConnectionsChange = function(type, index, connected, link_info) {
				if (origOnConnectionsChange) origOnConnectionsChange.apply(this, arguments);
				if (type === LiteGraph.INPUT && index === 0) {
					if (connected && link_info) {
						const srcNode = this.graph.getNodeById(link_info.origin_id);
						if (srcNode) {
							const srcType = srcNode.outputs[link_info.origin_slot].type;
							this.inputs[0].type = srcType; this.inputs[0].name = "value";
							this.outputs[0].type = srcType; this.outputs[0].name = srcType;
							
							const color = getTypeColor(srcType);
							if (color) {
								this.color = darkenHex(color, 0.6);
								this.bgcolor = darkenHex(color, 0.4);
							} else {
								this.color = "#7612DA";
								this.bgcolor = "#000000";
							}
						}
					} else {
						this.inputs[0].type = "*"; this.inputs[0].name = "value";
						this.outputs[0].type = "*"; this.outputs[0].name = "value";
						this.color = "#7612DA";
						this.bgcolor = "#000000";
					}
					
					if (this.outputs[0].links) {
						this.outputs[0].links.forEach(lid => {
							const l = this.graph.links[lid] || (this.graph.links.get && this.graph.links.get(lid));
							if (l) {
								const getn = this.graph.getNodeById(l.target_id);
								if (getn && (getn.type === "TJ_GetNode" || getn.type === "TJ_MultiGetNode")) {
									getn.inputs[l.target_slot].type = this.outputs[0].type;
									getn.outputs[l.target_slot].type = this.outputs[0].type;
									getn.outputs[l.target_slot].name = this.outputs[0].type;
									
									const cColor = getTypeColor(this.outputs[0].type);
									if (cColor && getn.type === "TJ_GetNode") {
										getn.color = darkenHex(cColor, 0.6);
										getn.bgcolor = darkenHex(cColor, 0.4);
									}
								}
							}
						});
					}
				}
			};
		}
	}
});

app.registerExtension({
	name: "TJ.GetNode.Wireless",
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		if (nodeData.name === "TJ_GetNode") {
			const origOnNodeCreated = nodeType.prototype.onNodeCreated;
			nodeType.prototype.onNodeCreated = function() {
				if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);

                this.bgcolor = "#000000";
                this.color = "#7612DA";
                this.title_text_color = "#FFFFFF";

				const w = this.widgets.find(w => w.name === "set_name");
				if (w) {
					w.options = { values: ["(none)"] }; 
					w.callback = (val) => {
						this.title = "GET: " + val;
						this._connectToSetNode(val); 
					};
				}
				this.title = "GET: " + (w ? w.value : "");

				if (this.inputs && this.inputs[0]) {
					this.inputs[0].color_on = "transparent";
					this.inputs[0].color_off = "transparent";
					this.inputs[0].name = "wire"; 
				}
			};

			const origOnDrawForeground = nodeType.prototype.onDrawForeground;
			nodeType.prototype.onDrawForeground = function(ctx) {
				if (origOnDrawForeground) origOnDrawForeground.apply(this, arguments);
				const w = this.widgets?.find(x => x.name === "set_name");
				if (w && w.options) {
					w.options.values = getAllSetNames(this.graph);
				}
			};

			nodeType.prototype._connectToSetNode = function(setName) {
				if (!this.graph) return;
				if (this.inputs[0].link != null) this.graph.removeLink(this.inputs[0].link);

				if (!setName || setName === "(none)") {
					this.inputs[0].type = "*";
					this.inputs[0].name = "wire";
					this.outputs[0].type = "*";
					this.outputs[0].name = "value";
					this.color = "#7612DA";
					this.bgcolor = "#000000";
					return;
				}

				const sourceInfo = findSetterSourceInfo(this.graph, setName);
				
				if (sourceInfo) {
					sourceInfo.node.connect(sourceInfo.slot, this, 0); 
					const t = sourceInfo.node.outputs[sourceInfo.slot].type;
					this.inputs[0].type = t;
					this.inputs[0].name = "wire"; 
					this.outputs[0].type = t;
					this.outputs[0].name = t;
					
					const color = getTypeColor(t);
					if (color) {
						this.color = darkenHex(color, 0.6);
						this.bgcolor = darkenHex(color, 0.4);
					} else {
						this.color = "#7612DA";
						this.bgcolor = "#000000";
					}
				} else {
					this.inputs[0].type = "*";
					this.inputs[0].name = "wire";
					this.outputs[0].type = "*";
					this.outputs[0].name = "value";
					this.color = "#7612DA";
					this.bgcolor = "#000000";
				}
			};

			nodeType.prototype._syncWithSetNode = function() {
				if (this.inputs[0].link != null) {
					const l = this.graph.links[this.inputs[0].link] || (this.graph.links.get && this.graph.links.get(this.inputs[0].link));
					if (l) {
						const src = this.graph.getNodeById(l.origin_id);
						let srcName = null;
						if (src && src.type === "TJ_SetNode") {
							srcName = src.widgets.find(w=>w.name==="set_name")?.value;
						} else if (src && src.type === "TJ_MultiRouter" && src.properties?.auto_sets) {
							srcName = src.properties.auto_sets[l.origin_slot];
						}

						const myW = this.widgets.find(w=>w.name==="set_name");
						if (myW && srcName && myW.value !== srcName) {
							myW.value = srcName;
							this.title = "GET: " + srcName;
						}
					}
				}
			};

			const origOnConfigure = nodeType.prototype.onConfigure;
			nodeType.prototype.onConfigure = function() {
				if (origOnConfigure) origOnConfigure.apply(this, arguments);
				setTimeout(() => {
					this._syncWithSetNode();
					const w = this.widgets.find(w=>w.name==="set_name");
					if(w) {
						this._connectToSetNode(w.value);
						this.title = "GET: " + w.value;
					}
				}, 100);
			};
		}
	}
});

app.registerExtension({
	name: "TJ.MultiGetNode.Wireless",
	async beforeRegisterNodeDef(nodeType, nodeData, app) {
		if (nodeData.name === "TJ_MultiGetNode") {
			const origOnNodeCreated = nodeType.prototype.onNodeCreated;
			nodeType.prototype.onNodeCreated = function() {
				if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);

                this.bgcolor = "#000000";
                this.color = "#7612DA";
                this.title_text_color = "#FFFFFF";

				this.selectorCount = 0;
				this._addSelector("");
				this._addSelector("");
				this._rebuild();
			};

			const origOnDrawForeground = nodeType.prototype.onDrawForeground;
			nodeType.prototype.onDrawForeground = function(ctx) {
				if (origOnDrawForeground) origOnDrawForeground.apply(this, arguments);
				this.widgets?.forEach(w => {
					if (w.name?.startsWith("slot_") && w.options) {
						w.options.values = getAllSetNames(this.graph);
					}
				});
			};

			nodeType.prototype._selectors = function() { return (this.widgets || []).filter(w => w.name?.startsWith("slot_")); };
			nodeType.prototype._activeNames = function() { return this._selectors().map(w => w.value).filter(v => v && v !== "(none)"); };

			nodeType.prototype._addSelector = function(initial) {
				if (this._selectors().length >= MAX_PORTS) return null;
				const idx = ++this.selectorCount;
				
				const w = this.addWidget("combo", `slot_${idx}`, initial || "(none)", (v) => {
					this._onChange(w, v);
				}, { values: ["(none)"] });

				return w;
			};

			nodeType.prototype._onChange = function(w, v) {
				this._rebuild();
				const sels = this._selectors();
				if (v && v !== "(none)" && sels[sels.length - 1] === w && sels.length < MAX_PORTS) {
					this._addSelector("");
					this._rebuild();
				}
				app.canvas.setDirty(true, true);
			};

            // ★ Multi Get Node를 위한 자동 이름 동기화 함수 추가
            nodeType.prototype._syncWithSetNodes = function() {
                let changed = false;
                const sels = this._selectors();
                
                for (let i = 0; i < this.inputs.length; i++) {
                    const inp = this.inputs[i];
                    if (inp && inp.link != null) {
                        const l = this.graph.links[inp.link] || (this.graph.links.get && this.graph.links.get(inp.link));
                        if (l) {
                            const src = this.graph.getNodeById(l.origin_id);
                            let srcName = null;
                            if (src && src.type === "TJ_SetNode") {
                                srcName = src.widgets.find(w => w.name === "set_name")?.value;
                            } else if (src && src.type === "TJ_MultiRouter" && src.properties?.auto_sets) {
                                srcName = src.properties.auto_sets[l.origin_slot];
                            }
                            
                            const w = sels[i];
                            if (w && srcName && w.value !== srcName) {
                                w.value = srcName;
                                changed = true;
                            }
                        }
                    }
                }
                
                if (changed) {
                    this._rebuild();
                }
            };

			nodeType.prototype._rebuild = function() {
				const active = this._activeNames();
				const need = Math.max(active.length, 1);

				while (this.inputs.length < need) this.addInput(`wire_${this.inputs.length + 1}`, "*");
				while (this.inputs.length > need) {
					const i = this.inputs.length - 1;
					if (this.inputs[i].link != null) this.graph.removeLink(this.inputs[i].link);
					this.removeInput(i);
				}

				while (this.outputs.length < need) this.addOutput(`output_${this.outputs.length + 1}`, "*");
				while (this.outputs.length > need) {
					const i = this.outputs.length - 1;
					if (this.outputs[i].links?.length) [...this.outputs[i].links].forEach(l => this.graph.removeLink(l));
					this.removeOutput(i);
				}
				
				let firstValidType = null;

				this.inputs.forEach((inp, i) => {
					inp.color_on = "transparent"; inp.color_off = "transparent"; 
					inp.name = `wire_${i+1}`; 

					if (inp.link != null) this.graph.removeLink(inp.link);

					const name = active[i];
					if (name) {
						const sourceInfo = findSetterSourceInfo(this.graph, name);
						if (sourceInfo) {
							sourceInfo.node.connect(sourceInfo.slot, this, i); 
							const t = sourceInfo.node.outputs[sourceInfo.slot].type;
							inp.type = t;
							this.outputs[i].type = t;
							this.outputs[i].name = t;
							this.outputs[i].label = name;
							
							const typeC = getTypeColor(t);
							if (typeC) {
								this.outputs[i].color_on = typeC;
								this.outputs[i].color_off = typeC;
							}

							if (!firstValidType && t !== "*") firstValidType = t;
						}
					} else {
						inp.type = "*";
						this.outputs[i].type = "*";
						this.outputs[i].name = "*";
						this.outputs[i].label = `output_${i+1}`;
						this.outputs[i].color_on = null;
						this.outputs[i].color_off = null;
					}
				});

				const mColor = getTypeColor(firstValidType);
				if (mColor) {
					this.color = darkenHex(mColor, 0.6);
					this.bgcolor = darkenHex(mColor, 0.4);
				} else {
					this.color = "#7612DA";
					this.bgcolor = "#000000";
				}

				this.setSize(this.computeSize());
			};

			const origOnConfigure = nodeType.prototype.onConfigure;
			nodeType.prototype.onConfigure = function(data) {
				if (origOnConfigure) origOnConfigure.apply(this, arguments);
				if (data && data.widgets_values) {
					const savedSelectors = data.widgets_values.filter(v => typeof v === "string");
					while (this._selectors().length < savedSelectors.length) this._addSelector("");
					this._selectors().forEach((w, i) => { if (savedSelectors[i] !== undefined) w.value = savedSelectors[i]; });
				}
				setTimeout(() => {
                    if (this._syncWithSetNodes) this._syncWithSetNodes();
                    this._rebuild();
                }, 100);
			};
		}
	}
});


app.registerExtension({
	name: "TJ.GlobalContext",
	setup() {
		const origGetMenuOptions = LGraphNode.prototype.getMenuOptions;
		LGraphNode.prototype.getMenuOptions = function(canvas) {
			const options = origGetMenuOptions ? origGetMenuOptions.call(this, canvas) : [];
			const tjSubOptions = [];

			if (this.type === "TJ_SetNode" || this.type === "TJ_GetNode" || this.type === "TJ_MultiGetNode" || this.type === "TJ_MultiRouter") {
				tjSubOptions.push({
					content: (this.properties?.show_wire ? "👁️ Hide This Wire" : "👁️ Show This Wire"),
					callback: () => {
						if (!this.properties) this.properties = {};
						this.properties.show_wire = !this.properties.show_wire;
						app.canvas.setDirty(true, true);
					}
				});
				tjSubOptions.push(null);
			}

			if (this.type === "TJ_GetNode" || this.type === "TJ_MultiGetNode") {
				tjSubOptions.push({ 
					content: "🚀 Go to Source Node", 
					callback: () => {
						for (let i=0; i<this.inputs.length; i++) {
							if (this.inputs[i].link) {
								const l = this.graph.links[this.inputs[i].link] || this.graph.links.get(this.inputs[i].link);
								const setNode = this.graph.getNodeById(l.origin_id);
								if (setNode) { app.canvas.centerOnNode(setNode); app.canvas.selectNode(setNode); break; }
							}
						}
					} 
				});
			} else if (this.type === "TJ_SetNode") {
				const linkIds = this.outputs[0]?.links || [];
				if (linkIds.length > 0) {
					const subOptions = [];
					linkIds.forEach((lid, i) => {
						const l = this.graph.links[lid] || (this.graph.links.get && this.graph.links.get(lid));
						if (l) {
							const targetNode = this.graph.getNodeById(l.target_id);
							if (targetNode) {
								subOptions.push({
									content: `🚀 Go to Get Node #${i+1}`,
									callback: () => {
										app.canvas.centerOnNode(targetNode);
										app.canvas.selectNode(targetNode);
									}
								});
							}
						}
					});
					tjSubOptions.push({ content: "🚀 Go to Get Nodes...", has_submenu: true, submenu: { options: subOptions } });
				}
			}

			if (this.type === "TJ_MultiGetNode") {
				if (this._selectors && this._selectors().length > 1) {
					tjSubOptions.push({
						content: "✕ Remove Last Slot",
						callback: () => {
							const list = this._selectors();
							if (list.length <= 1) return;
							const wi = this.widgets.indexOf(list[list.length - 1]);
							if (wi !== -1) this.widgets.splice(wi, 1);
							this._rebuild();
							app.canvas?.setDirty(true, true);
						}
					});
				}
			}

			if (this._tj_submenu_options && this._tj_submenu_options.length > 0) {
				tjSubOptions.push(...this._tj_submenu_options);
			}

			if (tjSubOptions.length > 0) tjSubOptions.push(null);

			tjSubOptions.push({
				content: "➕ Add Set Node",
				callback: () => {
					const setNode = LiteGraph.createNode("TJ_SetNode");
					setNode.pos = [this.pos[0] + this.size[0] + 30, this.pos[1]];
					this.graph.add(setNode);
					app.canvas.selectNode(setNode, false);
					app.canvas.setDirty(true, true);
				}
			});

			tjSubOptions.push({
				content: "➕ Add Get Node",
				callback: () => {
					const getNode = LiteGraph.createNode("TJ_GetNode");
					getNode.pos = [this.pos[0] - 230, this.pos[1]];
					this.graph.add(getNode);
					app.canvas.selectNode(getNode, false);
					app.canvas.setDirty(true, true);
				}
			});

			tjSubOptions.push(null);

			tjSubOptions.push({
				content: "📦 Convert ALL Outputs to Set",
				callback: () => {
					if (!this.outputs) return;
					let offsetY = 0;
					this.outputs.forEach((out, slotIdx) => {
						const setNode = LiteGraph.createNode("TJ_SetNode");
						setNode.pos = [this.pos[0] + this.size[0] + 30, this.pos[1] + offsetY];
						this.graph.add(setNode);
						this.connect(slotIdx, setNode, 0);

						const autoName = `${this.type}_${out.name}`;
						setNode.widgets.find(w => w.name === "set_name").value = autoName;
						setNode.title = "SET: " + autoName;

						offsetY += 80;
					});
					app.canvas.setDirty(true, true);
				}
			});

			tjSubOptions.push({
				content: "📦 Convert ALL Inputs to Get",
				callback: () => {
					if (!this.inputs) return;
					let offsetY = 0;
					this.inputs.forEach((inp, slotIdx) => {
						if (inp.link != null) return;
						const getNode = LiteGraph.createNode("TJ_GetNode");
						getNode.pos = [this.pos[0] - 230, this.pos[1] + offsetY];
						this.graph.add(getNode);
						getNode.connect(0, this, slotIdx);
						offsetY += 80;
					});
					app.canvas.setDirty(true, true);
				}
			});

			tjSubOptions.push(null);

			tjSubOptions.push({
				content: (globalShowWire ? "🛑 Hide ALL Wires (전체 숨김)" : "🌐 Show ALL Wires (전체 보기)"),
				callback: () => {
					globalShowWire = !globalShowWire;
					app.canvas.setDirty(true, true);
				}
			});

			const cleanOptions = options.filter(o => o && o.content !== "🟩 TJ Node");
			cleanOptions.push(null, {
				content: "🟩 TJ Node",
				has_submenu: true,
				submenu: { options: tjSubOptions }
			});

			return cleanOptions;
		};

		const origGetCanvasMenuOptions = LGraphCanvas.prototype.getCanvasMenuOptions;
		LGraphCanvas.prototype.getCanvasMenuOptions = function() {
			const options = origGetCanvasMenuOptions ? origGetCanvasMenuOptions.apply(this, arguments) : [];
			options.push(null, {
				content: (globalShowWire ? "🛑 Hide ALL TJ Wires" : "🌐 Show ALL TJ Wires"),
				callback: () => {
					globalShowWire = !globalShowWire;
					app.canvas.setDirty(true, true);
				}
			});
			return options;
		};
	}
});