// TJ Shortcut Launcher v0.2.8
// Flat Add-Images style buttons + subtle neon ambience, height-only resize.
// Added JSON Export / Import + color picker. Settings button now follows custom colors.
import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

const TJ_BLUE = "#0A7BFF";
const TJ_BLUE_DARK = "#004FC7";
const TJ_CYAN = "#5FFBFF";
const TJ_BLACK = "#000000";

function tjRoundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function tjClampText(ctx, text, maxWidth) {
    text = String(text || "Shortcut");
    if (ctx.measureText(text).width <= maxWidth) return text;
    let out = text;
    while (out.length > 1 && ctx.measureText(out + "...").width > maxWidth) out = out.slice(0, -1);
    return out + "...";
}

function tjNormalizeHexColor(value, fallback) {
    const v = String(value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : fallback;
}

function tjHexToRgb(hex) {
    const v = tjNormalizeHexColor(hex, "#075FC8").replace("#", "");
    return {
        r: parseInt(v.slice(0, 2), 16),
        g: parseInt(v.slice(2, 4), 16),
        b: parseInt(v.slice(4, 6), 16)
    };
}

function tjRgbToHex(r, g, b) {
    return "#" + [r, g, b]
        .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
}

function tjLightenColor(hex, amount = 28) {
    const c = tjHexToRgb(hex);
    return tjRgbToHex(c.r + amount, c.g + amount, c.b + amount);
}

function tjDarkenColor(hex, amount = 38) {
    const c = tjHexToRgb(hex);
    return tjRgbToHex(c.r - amount, c.g - amount, c.b - amount);
}

function tjHexToRgba(hex, alpha = 1) {
    const c = tjHexToRgb(hex);
    return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

function tjShortcutAutoHeight(node) {
    const count = Math.max(0, node?.properties?.shortcuts?.length || 0);
    const titleAndPadding = 34;
    const buttonH = 22;
    const gap = 8;
    const settingsH = 24;
    const bottom = 12;
    return Math.max(86, titleAndPadding + count * (buttonH + gap) + settingsH + bottom);
}

async function tjOpenShortcut(target) {
    try {
        await api.fetchApi("/tj/shortcut/open", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target: target || "" })
        });
    } catch (err) {
        console.error("[TJ Shortcut Launcher] open failed", err);
    }
}

function tjEnsureStyle() {
    if (document.getElementById("tj-shortcut-style")) return;
    const style = document.createElement("style");
    style.id = "tj-shortcut-style";
    style.textContent = `
.tj-shortcut-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.58);z-index:100000;display:flex;align-items:center;justify-content:center;font-family:Arial,Helvetica,sans-serif}
.tj-shortcut-modal{width:min(760px,92vw);max-height:86vh;background:#050b12;border:1px solid #0a7bff;border-radius:18px;box-shadow:0 0 28px rgba(10,123,255,.45);display:flex;flex-direction:column;overflow:hidden;color:#eaffff}
.tj-shortcut-head{padding:16px 20px;border-bottom:1px solid rgba(10,123,255,.45);display:flex;justify-content:space-between;align-items:center;background:#07111e}
.tj-shortcut-title{font-size:18px;font-weight:800;color:#5ffbff}
.tj-shortcut-head-actions{display:flex;gap:8px;align-items:center}
.tj-shortcut-hidden-file{display:none}
.tj-shortcut-scroll{padding:16px;overflow-y:auto;max-height:calc(86vh - 138px);box-sizing:border-box}
.tj-shortcut-global{border:1px solid rgba(10,123,255,.45);border-radius:16px;padding:14px;margin-bottom:14px;background:#04101d;box-shadow:inset 0 0 0 1px rgba(95,251,255,.10)}
.tj-shortcut-color-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.tj-shortcut-color-row{display:flex;gap:8px;align-items:center}
.tj-shortcut-color-row .tj-shortcut-input{flex:1}
.tj-shortcut-picker{width:44px;height:38px;border:1px solid rgba(95,251,255,.35);border-radius:10px;background:#020806;padding:3px;cursor:pointer;box-sizing:border-box}
.tj-shortcut-card{border:1px solid rgba(95,251,255,.35);border-radius:16px;padding:14px;margin-bottom:14px;background:#020807;box-shadow:inset 0 0 0 1px rgba(10,123,255,.12)}
.tj-shortcut-card-top{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.tj-shortcut-num{width:28px;height:28px;border-radius:50%;background:#063d4f;color:#5ffbff;font-weight:800;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.tj-shortcut-spacer{flex:1}
.tj-shortcut-label{display:block;color:#95ffc0;font-size:12px;font-weight:800;margin:8px 0 6px}
.tj-shortcut-input,.tj-shortcut-textarea{width:100%;box-sizing:border-box;background:#020806;color:#eaffff;border:1px solid rgba(95,251,255,.35);border-radius:12px;padding:10px 12px;font-size:13px;outline:none}
.tj-shortcut-textarea{resize:vertical;min-height:52px}
.tj-shortcut-row{display:flex;gap:8px;align-items:center}
.tj-shortcut-row .tj-shortcut-input{flex:1}
.tj-shortcut-btn{border:1px solid #0a7bff;background:#06101d;color:#5ffbff;border-radius:11px;padding:8px 12px;font-weight:800;cursor:pointer;white-space:nowrap}
.tj-shortcut-btn:hover{background:#09213d}
.tj-shortcut-btn-danger{border-color:#ff4a68;color:#ff9aaa;background:#160407}
.tj-shortcut-btn-primary{background:#0050c7;border-color:#0a7bff;color:#5ffbff}
.tj-shortcut-foot{padding:14px 16px;border-top:1px solid rgba(10,123,255,.45);display:flex;justify-content:space-between;gap:8px;background:#07111e}
.tj-shortcut-foot-right{display:flex;gap:8px}
`;
    document.head.appendChild(style);
}

function tjShortcutSettings(node) {
    tjEnsureStyle();

    const backdrop = document.createElement("div");
    backdrop.className = "tj-shortcut-backdrop";

    const modal = document.createElement("div");
    modal.className = "tj-shortcut-modal";
    backdrop.appendChild(modal);

    const header = document.createElement("div");
    header.className = "tj-shortcut-head";
    header.innerHTML = `<div class="tj-shortcut-title">TJ Shortcut Settings</div>`;

    const headActions = document.createElement("div");
    headActions.className = "tj-shortcut-head-actions";

    const exportBtn = document.createElement("button");
    exportBtn.className = "tj-shortcut-btn";
    exportBtn.textContent = "Export JSON";

    const importBtn = document.createElement("button");
    importBtn.className = "tj-shortcut-btn";
    importBtn.textContent = "Import JSON";

    const importInput = document.createElement("input");
    importInput.className = "tj-shortcut-hidden-file";
    importInput.type = "file";
    importInput.accept = "application/json,.json";

    headActions.append(exportBtn, importBtn, importInput);
    header.appendChild(headActions);

    const close = document.createElement("button");
    close.className = "tj-shortcut-btn";
    close.textContent = "Close";
    modal.appendChild(header);

    const scroll = document.createElement("div");
    scroll.className = "tj-shortcut-scroll";
    modal.appendChild(scroll);

    const footer = document.createElement("div");
    footer.className = "tj-shortcut-foot";
    const addBtn = document.createElement("button");
    addBtn.className = "tj-shortcut-btn tj-shortcut-btn-primary";
    addBtn.textContent = "+ Add Button";
    const right = document.createElement("div");
    right.className = "tj-shortcut-foot-right";
    const saveBtn = document.createElement("button");
    saveBtn.className = "tj-shortcut-btn tj-shortcut-btn-primary";
    saveBtn.textContent = "Save";
    right.append(saveBtn);
	const center = document.createElement("div");
	center.style.flex = "1";
	center.style.display = "flex";
	center.style.justifyContent = "center";

	center.appendChild(close);

	footer.append(addBtn, center, right);
    modal.appendChild(footer);

    let items = JSON.parse(JSON.stringify(node.properties?.shortcuts || []));
    if (!items.length) items.push({ label: "", target: "", desc: "" });

    let buttonColorValue = tjNormalizeHexColor(node.properties?.buttonColor, "#075FC8");
    let textColorValue = tjNormalizeHexColor(node.properties?.textColor, TJ_CYAN);

    function normalizeShortcutItems(raw) {
        const source = Array.isArray(raw) ? raw : (Array.isArray(raw?.shortcuts) ? raw.shortcuts : []);
        return source
            .map(v => ({
                label: String(v?.label || v?.name || "").trim(),
                target: String(v?.target || v?.url || v?.path || "").trim(),
                desc: String(v?.desc || v?.description || v?.tooltip || "").trim()
            }))
            .filter(v => v.label || v.target || v.desc);
    }

    function exportShortcutsJson() {
        const payload = {
            name: "TJ Shortcut Launcher Preset",
            version: 1,
            exported_at: new Date().toISOString(),
            buttonColor: tjNormalizeHexColor(buttonColorValue, "#075FC8"),
            textColor: tjNormalizeHexColor(textColorValue, TJ_CYAN),
            shortcuts: normalizeShortcutItems(items)
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        a.href = url;
        a.download = `tj_shortcuts_${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function importShortcutsJson(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(String(reader.result || "{}"));
                const imported = normalizeShortcutItems(parsed);

                if (!imported.length) {
                    alert("No shortcut items found in this JSON.");
                    return;
                }

                const ok = confirm(`Import ${imported.length} shortcut button(s)?\nCurrent unsaved settings will be replaced.`);
                if (!ok) return;

                items = imported;
                if (parsed?.buttonColor) buttonColorValue = tjNormalizeHexColor(parsed.buttonColor, buttonColorValue);
                if (parsed?.textColor) textColorValue = tjNormalizeHexColor(parsed.textColor, textColorValue);
                render();
                requestAnimationFrame(() => { scroll.scrollTop = 0; });
            } catch (err) {
                alert("Import failed: invalid JSON file.\n" + err);
            } finally {
                importInput.value = "";
            }
        };
        reader.readAsText(file, "utf-8");
    }

    function render() {
        scroll.innerHTML = "";

        const globalCard = document.createElement("div");
        globalCard.className = "tj-shortcut-global";

        const globalTitle = document.createElement("div");
        globalTitle.className = "tj-shortcut-title";
        globalTitle.style.fontSize = "14px";
        globalTitle.textContent = "Global Button Style";

        const colorGrid = document.createElement("div");
        colorGrid.className = "tj-shortcut-color-grid";

        const bgWrap = document.createElement("div");
        const bgLabel = document.createElement("label");
        bgLabel.className = "tj-shortcut-label";
        bgLabel.textContent = "Button Background Color";
        const bgRow = document.createElement("div");
        bgRow.className = "tj-shortcut-color-row";
        const bgPicker = document.createElement("input");
        bgPicker.className = "tj-shortcut-picker";
        bgPicker.type = "color";
        bgPicker.value = tjNormalizeHexColor(buttonColorValue, "#075FC8");
        const bgInput = document.createElement("input");
        bgInput.className = "tj-shortcut-input";
        bgInput.value = buttonColorValue;
        bgInput.placeholder = "#075FC8";
        bgRow.append(bgPicker, bgInput);
        bgWrap.append(bgLabel, bgRow);

        const textWrap = document.createElement("div");
        const colorLabel = document.createElement("label");
        colorLabel.className = "tj-shortcut-label";
        colorLabel.textContent = "Button Text Color";
        const textRow = document.createElement("div");
        textRow.className = "tj-shortcut-color-row";
        const textPicker = document.createElement("input");
        textPicker.className = "tj-shortcut-picker";
        textPicker.type = "color";
        textPicker.value = tjNormalizeHexColor(textColorValue, TJ_CYAN);
        const colorInput = document.createElement("input");
        colorInput.className = "tj-shortcut-input";
        colorInput.value = textColorValue;
        colorInput.placeholder = "#5FFBFF";
        textRow.append(textPicker, colorInput);
        textWrap.append(colorLabel, textRow);

        bgPicker.addEventListener("input", () => {
            buttonColorValue = bgPicker.value.toUpperCase();
            bgInput.value = buttonColorValue;
        });
        bgInput.addEventListener("input", () => {
            buttonColorValue = bgInput.value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(buttonColorValue)) bgPicker.value = buttonColorValue;
        });
        colorInput.addEventListener("input", () => {
            textColorValue = colorInput.value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(textColorValue)) textPicker.value = textColorValue;
        });
        textPicker.addEventListener("input", () => {
            textColorValue = textPicker.value.toUpperCase();
            colorInput.value = textColorValue;
        });

        colorGrid.append(bgWrap, textWrap);
        globalCard.append(globalTitle, colorGrid);
        scroll.appendChild(globalCard);

        items.forEach((item, idx) => {
            const card = document.createElement("div");
            card.className = "tj-shortcut-card";

            const top = document.createElement("div");
            top.className = "tj-shortcut-card-top";
            const num = document.createElement("div");
            num.className = "tj-shortcut-num";
            num.textContent = String(idx + 1);
            const up = document.createElement("button");
            up.className = "tj-shortcut-btn";
            up.textContent = "▲";
            up.disabled = idx === 0;
            const down = document.createElement("button");
            down.className = "tj-shortcut-btn";
            down.textContent = "▼";
            down.disabled = idx === items.length - 1;
            const remove = document.createElement("button");
            remove.className = "tj-shortcut-btn tj-shortcut-btn-danger";
            remove.textContent = "Remove";
            const spacer = document.createElement("div");
            spacer.className = "tj-shortcut-spacer";
            top.append(num, spacer, up, down, remove);

            const nameLabel = document.createElement("label");
            nameLabel.className = "tj-shortcut-label";
            nameLabel.textContent = "Button Name";
            const name = document.createElement("input");
            name.className = "tj-shortcut-input";
            name.value = item.label || "";

            const pathLabel = document.createElement("label");
            pathLabel.className = "tj-shortcut-label";
            pathLabel.textContent = "Path / URL";
            const row = document.createElement("div");
            row.className = "tj-shortcut-row";
            const target = document.createElement("input");
            target.className = "tj-shortcut-input";
            target.value = item.target || "";
            row.append(target);

            const descLabel = document.createElement("label");
            descLabel.className = "tj-shortcut-label";
            descLabel.textContent = "Description / Tooltip";
            const desc = document.createElement("textarea");
            desc.className = "tj-shortcut-textarea";
            desc.value = item.desc || "";

            name.addEventListener("input", () => item.label = name.value);
            target.addEventListener("input", () => item.target = target.value);
            desc.addEventListener("input", () => item.desc = desc.value);
            remove.addEventListener("click", () => { items.splice(idx, 1); render(); });
            up.addEventListener("click", () => { if (idx > 0) { [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]]; render(); } });
            down.addEventListener("click", () => { if (idx < items.length - 1) { [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]]; render(); } });

            card.append(top, nameLabel, name, pathLabel, row, descLabel, desc);
            scroll.appendChild(card);
        });
    }

    exportBtn.addEventListener("click", exportShortcutsJson);
    importBtn.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", () => importShortcutsJson(importInput.files?.[0]));

    addBtn.addEventListener("click", () => {
        items.push({ label: "", target: "", desc: "" });
        render();
        requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; });
    });

    function destroy() { backdrop.remove(); }
    close.addEventListener("click", destroy);
	saveBtn.addEventListener("click", () => {
		node.properties.shortcuts = normalizeShortcutItems(items);
        node.properties.buttonColor = tjNormalizeHexColor(buttonColorValue, "#075FC8");
        node.properties.textColor = tjNormalizeHexColor(textColorValue, TJ_CYAN);

		node.size[1] = tjShortcutAutoHeight(node);
		node.setDirtyCanvas(true, true);

		// Save feedback
		const oldText = saveBtn.textContent;
		const oldColor = saveBtn.style.color;

		saveBtn.textContent = "Saved!!";
		saveBtn.style.color = "#ff3355";

		setTimeout(() => {
			saveBtn.textContent = oldText;
			saveBtn.style.color = oldColor;
		}, 800);
	});

    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) destroy(); });
    render();
    document.body.appendChild(backdrop);
}

function tjDrawButton(ctx, x, y, w, h, label, index, hover, buttonColor, textColor) {
    ctx.save();

    const baseColor = tjNormalizeHexColor(buttonColor, "#075FC8");
    const fontColor = tjNormalizeHexColor(textColor, TJ_CYAN);
    const hoverColor = tjLightenColor(baseColor, 22);
    const shadowBase = tjLightenColor(baseColor, 58);
    const badgeColor = tjHexToRgba(tjDarkenColor(baseColor, 42), 0.55);

    ctx.shadowBlur = hover ? 8 : 4;
    ctx.shadowColor = tjHexToRgba(shadowBase, hover ? 0.42 : 0.22);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    ctx.fillStyle = hover ? hoverColor : baseColor;
    tjRoundRect(ctx, x, y, w, h, 9);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    ctx.strokeStyle = tjHexToRgba(fontColor, hover ? 0.45 : 0.18);
    ctx.lineWidth = 1;
    tjRoundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 8);
    ctx.stroke();

    ctx.fillStyle = badgeColor;
    ctx.beginPath();
    ctx.arc(x + 17, y + h / 2, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = fontColor;
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index), x + 17, y + h / 2);

    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";

    const text = tjClampText(ctx, label || "Shortcut", Math.max(40, w - 44));
    ctx.fillText(text, x + w / 2, y + h / 2);

    ctx.restore();
}

function tjDrawSettings(ctx, x, y, w, h, hover, buttonColor, textColor) {
    ctx.save();

    const baseColor = tjNormalizeHexColor(buttonColor, "#075FC8");
    const fontColor = tjNormalizeHexColor(textColor, TJ_CYAN);
    const shadowBase = tjLightenColor(baseColor, 58);
    const settingsFill = hover ? tjHexToRgba(tjDarkenColor(baseColor, 56), 0.34) : TJ_BLACK;

    ctx.shadowBlur = hover ? 7 : 3;
    ctx.shadowColor = tjHexToRgba(shadowBase, hover ? 0.36 : 0.18);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    ctx.fillStyle = settingsFill;
    tjRoundRect(ctx, x, y, w, h, 9);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Settings border follows the custom button background color family, not text color.
    const settingsBorder = tjHexToRgba(tjLightenColor(baseColor, hover ? 28 : 16), hover ? 0.72 : 0.48);
    ctx.strokeStyle = settingsBorder;
    ctx.lineWidth = 1;
    tjRoundRect(ctx, x + 0.3, y + 0.3, w - 1, h - 1, 8);
    ctx.stroke();

    ctx.fillStyle = fontColor;
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚙ Settings", x + w / 2, y + h / 2);

    ctx.restore();
}

app.registerExtension({
    name: "TJ.ShortcutLauncher",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "TJShortcutLauncher") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        const onDrawForeground = nodeType.prototype.onDrawForeground;
        const onMouseDown = nodeType.prototype.onMouseDown;
        const onMouseMove = nodeType.prototype.onMouseMove;

        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            this.bgcolor = "#000000";
            this.color = "#7612DA";
            this.title_text_color = "#FFFFFF";
            this.properties ??= {};
            this.properties.shortcuts ??= [];
            this.properties.buttonColor = tjNormalizeHexColor(this.properties.buttonColor, "#075FC8");
            this.properties.textColor = tjNormalizeHexColor(this.properties.textColor, TJ_CYAN);
            this.tjShortcutRects = [];
            this.tjSettingsRect = null;
            this.tjHoverIndex = -1;
            this.tjHoverSettings = false;

            if (!this.size || !this.size.length) this.size = [190, 100];

            this.min_size = [40, 86];
            this.resizable = true;

            this.setDirtyCanvas(true, true);
        };

        nodeType.prototype.onDrawForeground = function (ctx) {
            onDrawForeground?.apply(this, arguments);

            const shortcuts = this.properties?.shortcuts || [];
            this.tjShortcutRects = [];

            const marginX = 14;
            let y = 30;

            const w = Math.max(10, this.size[0] - marginX * 2);
            const buttonH = 22;
            const gap = 8;

            shortcuts.forEach((item, i) => {
                const rect = { x: marginX, y, w, h: buttonH, item, index: i };
                this.tjShortcutRects.push(rect);
                tjDrawButton(
                    ctx,
                    rect.x,
                    rect.y,
                    rect.w,
                    rect.h,
                    item.label,
                    i + 1,
                    this.tjHoverIndex === i,
                    this.properties?.buttonColor,
                    this.properties?.textColor
                );
                y += buttonH + gap;
            });

            this.tjSettingsRect = { x: marginX, y: y + 2, w, h: 24 };
            tjDrawSettings(
                ctx,
                this.tjSettingsRect.x,
                this.tjSettingsRect.y,
                this.tjSettingsRect.w,
                this.tjSettingsRect.h,
                this.tjHoverSettings,
                this.properties?.buttonColor,
                this.properties?.textColor
            );

            const desiredHeight = tjShortcutAutoHeight(this);
            if (Math.abs(this.size[1] - desiredHeight) > 1) {
                this.size[1] = desiredHeight;
            }
        };

        nodeType.prototype.onMouseMove = function (event, pos, canvas) {
            const oldIndex = this.tjHoverIndex;
            const oldSettings = this.tjHoverSettings;
            this.tjHoverIndex = -1;
            this.tjHoverSettings = false;

            for (const rect of this.tjShortcutRects || []) {
                if (pos[0] >= rect.x && pos[0] <= rect.x + rect.w && pos[1] >= rect.y && pos[1] <= rect.y + rect.h) {
                    this.tjHoverIndex = rect.index;
                    canvas.canvas.title = rect.item?.desc || rect.item?.target || "";
                    break;
                }
            }

            const r = this.tjSettingsRect;
            if (r && pos[0] >= r.x && pos[0] <= r.x + r.w && pos[1] >= r.y && pos[1] <= r.y + r.h) {
                this.tjHoverSettings = true;
                canvas.canvas.title = "Edit shortcut buttons";
            }

            if (this.tjHoverIndex < 0 && !this.tjHoverSettings) canvas.canvas.title = "";
            if (oldIndex !== this.tjHoverIndex || oldSettings !== this.tjHoverSettings) this.setDirtyCanvas(true, true);

            return onMouseMove?.apply(this, arguments);
        };

        nodeType.prototype.onMouseDown = function (event, pos, canvas) {
            for (const rect of this.tjShortcutRects || []) {
                if (pos[0] >= rect.x && pos[0] <= rect.x + rect.w && pos[1] >= rect.y && pos[1] <= rect.y + rect.h) {
                    tjOpenShortcut(rect.item?.target || "");
                    return true;
                }
            }

            const r = this.tjSettingsRect;
            if (r && pos[0] >= r.x && pos[0] <= r.x + r.w && pos[1] >= r.y && pos[1] <= r.y + r.h) {
                tjShortcutSettings(this);
                return true;
            }

            return onMouseDown?.apply(this, arguments);
        };
    }
});