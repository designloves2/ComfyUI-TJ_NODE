import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// Send (TJ) → Send Point (TJ)
// 두 노드는 그래프상 연결되지 않는다. 버튼 클릭 = API 한 번으로 '값 복사'.
//
// 버튼은 Send Point 의 point_name(고유 이름) 으로 만들어진다. (노드 제목 아님)
// 이름이 비어 있으면 버튼은 만들어지지 않는다.
// 받은 값은 received_* 위젯에 저장되어 워크플로우와 함께 보존된다(영구 기억).
// 미리보기는 종류별로: IMAGE→이미지, VIDEO→플레이어, STRING→텍스트.

const ACCENT = "#7612DA";   // TJ 브랜드 컬러
const POINT_TYPE = "TJ_SendPoint";
const SENDER_TYPE = "TJ_Send";
const INTERNAL_WIDGETS = [
    "received_ref",
    "received_text",
    "received_kind",
    "received_info",
];

const findWidget = (node, name) => node.widgets?.find((w) => w.name === name);
const getAllPointNodes = () =>
    app.graph ? app.graph._nodes.filter((n) => n.type === POINT_TYPE) : [];
const pointName = (node) => (findWidget(node, "point_name")?.value || "").trim();
const setW = (node, name, value) => {
    const w = findWidget(node, name);
    if (w) w.value = value;
};

// TJ_NODE 공통 위젯 숨김 방식 (type + computeSize + hidden 을 함께 처리)
// DOM 기반 위젯(customtext 등)은 실제 요소도 감춰야 자리를 차지하지 않는다.
function hideWidget(widget) {
    if (!widget || widget.__tjHidden) return;
    widget.__tjHidden = true;
    widget.type = "hidden";
    widget.computeSize = () => [0, -4];
    widget.hidden = true;
    if (widget.element) widget.element.style.display = "none";
}

// 숨김 위젯을 반영해 노드를 최소 크기로 줄인다 (새로 배치했을 때 과도하게 큰 문제)
function fitPointNode(node) {
    node.setSize(node.computeSize());
    node.setDirtyCanvas(true, true);
}

// ── 캐시 관리 팝업 (Send 노드 타이틀의 ? 버튼) ─────────────────
const fmtBytes = (b) => {
    if (!b) return "0 B";
    const u = ["B", "KB", "MB", "GB"];
    let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return `${b.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
};
const fmtAgo = (ts) => {
    if (!ts) return "-";
    const s = Date.now() / 1000 - ts;
    if (s < 60) return "방금";
    if (s < 3600) return `${Math.floor(s / 60)}분 전`;
    if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
    return `${Math.floor(s / 86400)}일 전`;
};

let cachePanel = null;

function closeCachePanel() {
    cachePanel?.remove();
    cachePanel = null;
}

async function openCachePanel() {
    closeCachePanel();
    const el = document.createElement("div");
    cachePanel = el;
    el.style.cssText = `
        position:fixed; top:70px; right:16px; width:290px; z-index:10000;
        background:#1b1b1f; color:#ddd; border:1px solid ${ACCENT};
        border-radius:8px; box-shadow:0 8px 28px rgba(0,0,0,.55);
        font-size:12px; font-family:sans-serif; overflow:hidden;`;
    el.innerHTML = `
        <div style="background:${ACCENT};color:#fff;padding:7px 10px;font-weight:600;
                    display:flex;justify-content:space-between;align-items:center;">
          <span>Send Bridge 캐시</span>
          <span data-close style="cursor:pointer;padding:0 4px;">✕</span>
        </div>
        <div data-body style="padding:10px;line-height:1.7;">불러오는 중…</div>`;
    el.querySelector("[data-close]").onclick = closeCachePanel;
    document.body.appendChild(el);
    await refreshCachePanel();
}

async function refreshCachePanel() {
    if (!cachePanel) return;
    const body = cachePanel.querySelector("[data-body]");
    let info;
    try {
        info = await (await fetch("/tj_send_bridge/cache_info")).json();
    } catch (e) {
        body.textContent = "조회 실패 (콘솔 확인)";
        return;
    }
    const L = info.limits || {};
    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#999;">파일 수</span><b>${info.files}</b></div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#999;">총 용량</span><b>${fmtBytes(info.bytes)}</b></div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#999;">가장 오래 미사용</span><span>${fmtAgo(info.oldest_ts)}</span></div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#999;">최근 사용</span><span>${fmtAgo(info.newest_ts)}</span></div>
      <div style="margin:8px 0;border-top:1px solid #333;"></div>
      <div style="color:#888;font-size:11px;line-height:1.6;">
        자동 정리 기준<br>· 미사용 ${L.max_age_days}일 경과<br>
        · 총 ${fmtBytes(L.max_bytes)} 초과<br>· ${L.max_files}개 초과
      </div>
      <div style="margin:10px 0 4px;display:flex;gap:6px;">
        <button data-prune style="flex:1;cursor:pointer;background:#2a2a30;color:#eee;
          border:1px solid #555;border-radius:5px;padding:6px 4px;">부분 정리</button>
        <button data-all style="flex:1;cursor:pointer;background:#3a1f1f;color:#ffb4b4;
          border:1px solid #a33;border-radius:5px;padding:6px 4px;">전체 정리</button>
      </div>
      <div data-msg style="min-height:16px;color:#8fd14f;font-size:11px;"></div>
      <div style="color:#777;font-size:10px;">부분 정리 = 위 자동 기준을 지금 적용<br>
        전체 정리 = 캐시 전부 삭제 (다시 Send 하면 복구)</div>`;

    const msg = body.querySelector("[data-msg]");
    const clean = async (mode) => {
        if (mode === "all" &&
            !confirm("캐시를 전부 삭제할까요?\n저장된 Send Point 미리보기가 사라지며, Send 를 다시 누르면 복구됩니다.")) {
            return;
        }
        msg.style.color = "#8fd14f";
        msg.textContent = "정리 중…";
        try {
            const res = await fetch("/tj_send_bridge/cache_clean", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode }),
            });
            const d = await res.json();
            await refreshCachePanel();
            const m = cachePanel?.querySelector("[data-msg]");
            if (m) m.textContent = `${d.removed}개 삭제 · ${fmtBytes(d.freed)} 확보`;
        } catch (e) {
            msg.style.color = "#ff6b6b";
            msg.textContent = "정리 실패 (콘솔 확인)";
        }
    };
    body.querySelector("[data-prune]").onclick = () => clean("prune");
    body.querySelector("[data-all]").onclick = () => clean("all");
}

// Send 노드 타이틀 우측에 ? 버튼을 그리고 클릭을 처리한다
const HELP_R = 7;
function installHelpButton(node) {
    if (node.__tjHelpInstalled) return;
    node.__tjHelpInstalled = true;

    const origDraw = node.onDrawForeground;
    node.onDrawForeground = function (ctx) {
        origDraw?.apply(this, arguments);
        if (this.flags?.collapsed) return;
        const cx = this.size[0] - 14;
        const cy = -LiteGraph.NODE_TITLE_HEIGHT * 0.5;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, HELP_R, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", cx, cy + 0.5);
        ctx.restore();
    };

    const origDown = node.onMouseDown;
    node.onMouseDown = function (e, pos, canvas) {
        // 타이틀 영역(y<0)의 우측 원 안을 클릭했는지
        const cx = this.size[0] - 14;
        const cy = -LiteGraph.NODE_TITLE_HEIGHT * 0.5;
        const dx = pos[0] - cx;
        const dy = pos[1] - cy;
        if (pos[1] < 0 && dx * dx + dy * dy <= (HELP_R + 3) * (HELP_R + 3)) {
            openCachePanel();
            return true;   // 드래그로 전파되지 않게
        }
        return origDown ? origDown.apply(this, arguments) : undefined;
    };
}

// ── 버튼 ───────────────────────────────────────────────────────
function rebuildSenderButtons(senderNode) {
    if (senderNode.widgets) {
        senderNode.widgets = senderNode.widgets.filter((w) => !w._tj_bridge_btn);
    }
    // 이름이 설정된 Send Point 만 버튼으로 만든다
    getAllPointNodes()
        .filter((p) => pointName(p) !== "")
        .forEach((pointNode) => {
            const btn = senderNode.addWidget("button", pointName(pointNode), null, () => {
                sendToPoint(senderNode, pointNode);
            });
            btn._tj_bridge_btn = true;
        });
    senderNode.setSize(senderNode.computeSize());
    senderNode.setDirtyCanvas(true, true);
}

// ── 미리보기 ───────────────────────────────────────────────────
function clearPreview(pointNode) {
    pointNode.imgs = null;
    if (pointNode._tj_preview_widget) {
        const i = pointNode.widgets?.indexOf(pointNode._tj_preview_widget);
        if (i >= 0) pointNode.widgets.splice(i, 1);
        pointNode._tj_preview_widget.element?.remove?.();
        pointNode._tj_preview_widget = null;
    }
    pointNode.setDirtyCanvas(true, true);
}

function viewUrl(view) {
    const qs = new URLSearchParams({
        filename: view.filename,
        subfolder: view.subfolder || "",
        type: view.type || "output",
        t: String(Date.now()), // 캐시 무효화
    });
    return `/view?${qs.toString()}`;
}

function showImagePreview(pointNode, view) {
    clearPreview(pointNode);
    const img = new Image();
    img.onload = () => {
        pointNode.imgs = [img];
        pointNode.setDirtyCanvas(true, true);
    };
    img.onerror = () => console.warn("[TJ Send Bridge] image preview failed", view);
    img.src = viewUrl(view);
}

function showVideoPreview(pointNode, view) {
    clearPreview(pointNode);
    // 높이를 px 로 '고정'한다. height:auto 로 두면 실제 렌더 높이가 위젯이 알린
    // 높이보다 커져서, 노드 하단에 큰 빈 여백이 생긴다.
    const wrap = document.createElement("div");
    wrap.style.cssText =
        "width:100%;box-sizing:border-box;background:#111;border-radius:4px;" +
        "overflow:hidden;display:block;";

    const el = document.createElement("video");
    el.controls = true;
    el.loop = true;
    el.muted = true;
    el.playsInline = true;
    el.preload = "metadata";
    el.style.cssText =
        "width:100%;height:100%;display:block;object-fit:contain;border-radius:4px;";
    el.src = viewUrl(view);

    let aspect = 9 / 16;          // 메타데이터 오기 전 임시 비율
    let boxH = 150;               // 현재 확정 높이(px)

    const applyHeight = (nodeWidth) => {
        boxH = Math.max(80, Math.round((nodeWidth - 20) * aspect) + 34); // 34 = 컨트롤 바
        wrap.style.height = boxH + "px";
        return boxH;
    };

    const w = pointNode.addDOMWidget("tj_preview", "custom", wrap, { serialize: false });
    w.computeSize = function (width) {
        return [width, applyHeight(width)];
    };
    applyHeight(pointNode.size[0]);

    el.addEventListener("loadedmetadata", () => {
        if (el.videoWidth > 0) {
            aspect = el.videoHeight / el.videoWidth;
            applyHeight(pointNode.size[0]);
            pointNode.setSize([pointNode.size[0], pointNode.computeSize()[1]]);
            pointNode.setDirtyCanvas(true, true);
        }
    });
    el.onerror = () => {
        // 재생 불가(코덱/스트리밍 미지원)여도 검은 화면 대신 안내를 남긴다
        wrap.innerHTML =
            `<span style="color:#aaa;font-size:11px;padding:6px;display:block;text-align:center;">` +
            `🎬 ${view.filename}<br>(브라우저에서 재생 불가 — 값 전달은 정상)</span>`;
        console.warn("[TJ Send Bridge] video preview failed", view);
    };
    wrap.appendChild(el);

    pointNode._tj_preview_widget = w;
    pointNode.setSize(pointNode.computeSize());
    pointNode.setDirtyCanvas(true, true);
}

function showTextPreview(pointNode, text) {
    clearPreview(pointNode);
    const el = document.createElement("textarea");
    el.readOnly = true;
    el.value = text ?? "";
    el.style.cssText =
        "width:100%;height:100%;box-sizing:border-box;resize:none;" +
        "background:#1a1a1a;color:#ddd;border:1px solid #444;border-radius:4px;" +
        "font-size:11px;padding:4px;font-family:monospace;";
    const w = pointNode.addDOMWidget("tj_preview", "custom", el, { serialize: false });
    w.computeSize = function (width) {
        return [width, 90];
    };
    pointNode._tj_preview_widget = w;
    pointNode.setSize(pointNode.computeSize());
    pointNode.setDirtyCanvas(true, true);
}

function applyPreview(pointNode, data) {
    if (data.kind === "image_path" && data.view) {
        showImagePreview(pointNode, data.view);
    } else if (data.kind === "video_path" && data.view) {
        showVideoPreview(pointNode, data.view);
    } else if (data.kind === "text") {
        showTextPreview(pointNode, data.text);
    } else {
        // LATENT 등 미리보기 불가 → 이전 미리보기 제거
        clearPreview(pointNode);
    }
}

// ── 부분 실행 (이 Send 노드에 연결된 상위 노드만) ──────────────
// ComfyUI /prompt 는 부분 그래프를 받으면 그것만 실행한다.
// Send 노드에서 입력 링크를 거슬러 올라가 필요한 노드만 추려 제출하므로
// 캔버스의 다른 그룹(SaveImage 등)은 실행되지 않는다.
function collectUpstream(output, startId) {
    const keep = new Set();
    const stack = [String(startId)];
    while (stack.length) {
        const id = stack.pop();
        if (keep.has(id) || !output[id]) continue;
        keep.add(id);
        const inputs = output[id].inputs || {};
        for (const v of Object.values(inputs)) {
            // 링크는 [nodeId, slotIndex] 형태
            if (Array.isArray(v) && v.length >= 1) stack.push(String(v[0]));
        }
    }
    return keep;
}

async function waitForPrompt(promptId, timeoutMs = 300000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        try {
            const res = await api.fetchApi(`/history/${promptId}`);
            const hist = await res.json();
            if (hist[promptId]) {
                const st = hist[promptId].status;
                return { done: true, ok: st?.status_str === "success", status: st };
            }
        } catch (e) {
            /* 아직 준비 전 */
        }
        await new Promise((r) => setTimeout(r, 400));
    }
    return { done: false, ok: false };
}

async function runUpstreamOnly(senderNode) {
    const p = await app.graphToPrompt();
    const output = p.output || {};
    if (!output[String(senderNode.id)]) {
        alert("이 Send 노드가 그래프에 없습니다. (뮤트/바이패스 상태인지 확인해주세요)");
        return false;
    }
    const keep = collectUpstream(output, senderNode.id);
    const pruned = {};
    keep.forEach((id) => {
        if (output[id]) pruned[id] = output[id];
    });

    const res = await api.fetchApi("/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            prompt: pruned,
            client_id: api.clientId,
            extra_data: { extra_pnginfo: { workflow: p.workflow } },
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        console.error("[TJ Send Bridge] partial run rejected", err);
        alert("부분 실행 요청이 거부되었습니다. 콘솔을 확인해주세요.");
        return false;
    }
    const data = await res.json();
    if (data.error) {
        console.error("[TJ Send Bridge] partial run error", data);
        alert("부분 실행 오류: " + (data.error.message || JSON.stringify(data.error)));
        return false;
    }
    const r = await waitForPrompt(data.prompt_id);
    if (!r.ok) {
        console.error("[TJ Send Bridge] partial run failed", r);
        alert("부분 실행이 실패했습니다. 콘솔/큐를 확인해주세요.");
        return false;
    }
    return true;
}

// ── 전송 ───────────────────────────────────────────────────────
async function postSend(senderNode, pointNode) {
    const res = await fetch("/tj_send_bridge/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            sender_id: String(senderNode.id),
            get_id: String(pointNode.id),
            source_label: senderNode.title || "Send (TJ)",
        }),
    });
    return res.json();
}

async function sendToPoint(senderNode, pointNode) {
    const name = pointName(pointNode);
    if (!name) {
        alert("Send Point 의 이름(point_name)이 비어 있습니다.");
        return;
    }
    try {
        let data = await postSend(senderNode, pointNode);

        // 아직 실행된 적이 없으면 → 이 Send 에 연결된 노드만 실행하고 다시 전달
        if (!data.ok && data.error === "no_cached_value") {
            const go = confirm(
                "아직 실행된 값이 없습니다.\n" +
                "이 Send 노드에 연결된 노드만 실행해서 값을 만들까요?\n" +
                "(전체 큐가 아니라 필요한 노드만 실행합니다)"
            );
            if (!go) return;
            const btnLabel = `${name} (실행 중…)`;
            const btn = senderNode.widgets?.find(
                (w) => w._tj_bridge_btn && w.name === name
            );
            const orig = btn?.name;
            if (btn) {
                btn.name = btnLabel;
                senderNode.setDirtyCanvas(true, true);
            }
            const ran = await runUpstreamOnly(senderNode);
            if (btn) {
                btn.name = orig;
                senderNode.setDirtyCanvas(true, true);
            }
            if (!ran) return;
            data = await postSend(senderNode, pointNode);
        }

        if (!data.ok) {
            alert("전달할 값이 없습니다. (" + (data.error || "unknown") + ")");
            return;
        }

        // 워크플로우에 함께 저장되도록 내부 슬롯 갱신 (영구 기억)
        setW(pointNode, "received_kind", data.persistent ? data.kind : "");
        setW(pointNode, "received_ref", data.ref || "");
        setW(pointNode, "received_text", data.kind === "text" ? data.text || "" : "");

        setPointStatus(pointNode, {
            source: data.source_label || "Send (TJ)",
            type: data.type_label || "?",
            persistent: !!data.persistent,
        });
        applyPreview(pointNode, data);
    } catch (e) {
        console.error("[TJ Send Bridge] send failed", e);
        alert("전달 중 오류가 발생했습니다. 콘솔을 확인해주세요.");
    }
}

// ── 상태 표시 ──────────────────────────────────────────────────
function ensureStatusWidget(pointNode) {
    let w = pointNode.widgets?.find((x) => x._tj_status);
    if (!w) {
        w = pointNode.addWidget("text", "received", "", () => {});
        w._tj_status = true;
        w.disabled = true;
        w.serialize = false; // 실제 저장은 received_info 가 담당
        pointNode.setSize(pointNode.computeSize());
    }
    return w;
}

function setPointStatus(pointNode, info) {
    const text = info.persistent
        ? `✅ ${info.type} ← ${info.source}`
        : `✅ ${info.type} ← ${info.source} · 세션 한정`;
    setW(pointNode, "received_info", text);
    ensureStatusWidget(pointNode).value = text;
    pointNode.setDirtyCanvas(true, true);
}

// ── 재오픈/재시작 후 복원 ──────────────────────────────────────
async function restorePoint(pointNode) {
    const kind = findWidget(pointNode, "received_kind")?.value || "";
    const ref = findWidget(pointNode, "received_ref")?.value || "";
    const text = findWidget(pointNode, "received_text")?.value || "";
    const saved = findWidget(pointNode, "received_info")?.value || "";

    // 저장된 게 아무것도 없으면 아무 것도 그리지 않는다 (빈 검은 박스 방지)
    if (!kind && !ref && !text && !saved) return;

    // 여러 훅에서 중복 호출되므로 동일 상태면 건너뛴다
    const sig = `${kind}|${ref}|${text.length}|${saved}`;
    if (pointNode._tj_restore_sig === sig) return;
    pointNode._tj_restore_sig = sig;

    if (saved) ensureStatusWidget(pointNode).value = saved;

    if (kind === "text") {
        showTextPreview(pointNode, text);
        return;
    }
    if (!ref) return;

    try {
        const res = await fetch(
            `/tj_send_bridge/view_params?ref=${encodeURIComponent(ref)}`
        );
        const data = await res.json();
        if (!data.view) {
            console.warn("[TJ Send Bridge] stored ref no longer resolvable:", ref);
            return;
        }
        if (kind === "video_path") showVideoPreview(pointNode, data.view);
        else showImagePreview(pointNode, data.view);
    } catch (e) {
        console.warn("[TJ Send Bridge] preview restore failed", e);
    }
}

app.registerExtension({
    name: "TJ_NODE.SendBridge",

    async nodeCreated(node) {
        if (node.type === SENDER_TYPE) {
            installHelpButton(node);      // 타이틀 우측 ? → 캐시 관리 팝업
            rebuildSenderButtons(node);
        } else if (node.type === POINT_TYPE) {
            INTERNAL_WIDGETS.forEach((n) => hideWidget(findWidget(node, n)));
            setTimeout(() => {
                // 새로 배치한 노드는 숨김 위젯을 반영해 최소 크기로 줄인다
                fitPointNode(node);
                restorePoint(node);
            }, 0);
        }
    },

    // 워크플로우 로드 시: 위젯 값이 JSON 에서 복원된 '뒤에' 호출된다.
    // nodeCreated 시점엔 아직 received_* 가 비어 있어 미리보기가 복원되지 않았음.
    async loadedGraphNode(node) {
        if (node.type !== POINT_TYPE) return;
        INTERNAL_WIDGETS.forEach((n) => hideWidget(findWidget(node, n)));
        restorePoint(node);
    },

    // 그래프 전체 로드 완료 후 한 번 더 보정 (프론트 버전에 따라
    // loadedGraphNode 가 없거나 순서가 다른 경우 대비)
    async afterConfigureGraph() {
        getAllPointNodes().forEach((node) => {
            INTERNAL_WIDGETS.forEach((n) => hideWidget(findWidget(node, n)));
            restorePoint(node);
        });
    },

    async setup() {
        // Send Point 의 생성/삭제/이름변경을 1초 폴링으로 감지해 버튼 목록 갱신
        // (제목이 아니라 point_name 값을 기준으로 signature 를 만든다)
        setInterval(() => {
            if (!app.graph) return;
            const points = getAllPointNodes();
            points.forEach((p) =>
                INTERNAL_WIDGETS.forEach((n) => hideWidget(findWidget(p, n)))
            );

            const sig = points
                .map((n) => `${n.id}:${pointName(n)}`)
                .sort()
                .join("|");

            app.graph._nodes
                .filter((n) => n.type === SENDER_TYPE)
                .forEach((senderNode) => {
                    installHelpButton(senderNode);   // 로드된 노드에도 ? 버튼 부착
                    if (senderNode._tj_last_sig !== sig) {
                        senderNode._tj_last_sig = sig;
                        rebuildSenderButtons(senderNode);
                    }
                });
        }, 1000);
    },
});
