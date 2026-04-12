const CARD_TYPE_OPTIONS = [
    { value: 0, label: "Point" },
    { value: 1, label: "Skill" },
];

const EFFECT_TYPE_OPTIONS = [
    { value: 0, label: "DrawPoint" },
    { value: 1, label: "DrawSkill" },
    { value: 2, label: "DrawPointToResolve" },
    { value: 3, label: "Discard" },
    { value: 4, label: "ModifyPoint" },
    { value: 5, label: "Move" },
    { value: 6, label: "Judge" },
    { value: 7, label: "AddActionPoint" },
    { value: 8, label: "Peek" },
    { value: 9, label: "ChangeCardState" },
];

const PARTICIPANT_FLAGS = [
    { value: 1, label: "MySkillCardsInHand" },
    { value: 2, label: "OpponentSkillCardsInHand" },
    { value: 4, label: "MyPointCardsOnBoard" },
    { value: 8, label: "OpponentPointCardsOnBoard" },
    { value: 16, label: "SkillCardsInDeck" },
    { value: 32, label: "PointCardsInDeck" },
    { value: 64, label: "CardsToResolve" },
    { value: 128, label: "MyBoardZone" },
    { value: 256, label: "OppentBoardZone" },
    { value: 512, label: "UserInterfaceZone" },
];

const VALUE_SOURCE_OPTIONS = [
    { value: 0, label: "CardPointInPool" },
    { value: 1, label: "CasterSkillCardsCount" },
    { value: 2, label: "CasterPointCardsCount" },
    { value: 3, label: "SourceSpecSelectedPointsSum" },
    { value: 4, label: "TargetSpecSelectedPointsSum" },
    { value: 5, label: "ResolvedCardsPointsSum" },
    { value: 6, label: "UserInterfaceZoneId" },
];

const BINARY_OP_OPTIONS = [
    { value: 0, label: "Add" },
    { value: 1, label: "Sub" },
    { value: 2, label: "Mul" },
    { value: 3, label: "Div" },
];

const COMPARE_OP_OPTIONS = [
    { value: 0, label: "Greater" },
    { value: 1, label: "GreaterEqual" },
    { value: 2, label: "Less" },
    { value: 3, label: "LessEqual" },
    { value: 4, label: "Equal" },
];

const SELECTION_MODE_OPTIONS = ["None", "All", "Choose", "First", "Last", "Random", "Min", "Max"];
const VALUE_EXPR_OPTIONS = ["NoneValue", "ConstValue", "VariableValue", "BinaryValue"];
const CONDITION_EXPR_OPTIONS = ["NoneCondition", "AllCondition", "CompareCondition", "AndCondition", "OddEvenCondition"];

const TYPE_NAMES = {
    NoneValue: "Game.Domain.NoneValue, Assembly-CSharp",
    ConstValue: "Game.Domain.ConstValue, Assembly-CSharp",
    VariableValue: "Game.Domain.VariableValue, Assembly-CSharp",
    BinaryValue: "Game.Domain.BinaryValue, Assembly-CSharp",
    NoneCondition: "Game.Domain.NoneCondition, Assembly-CSharp",
    AllCondition: "Game.Domain.AllCondition, Assembly-CSharp",
    CompareCondition: "Game.Domain.CompareCondition, Assembly-CSharp",
    AndCondition: "Game.Domain.AndCondition, Assembly-CSharp",
    OddEvenCondition: "Game.Domain.OddEvenCondition, Assembly-CSharp",
};

const builderState = {
    cards: [],
    filterText: "",
    selectedFileName: "",
    currentDocument: null,
    effectFoldouts: [],
    participantFoldouts: {},
    cardGroupFoldouts: {
        pending: true,
        completed: true,
    },
    flowPanelOpen: false,
    drawflowEditor: null,
    drawflowReady: false,
    currentFlow: null,
    selectedFlowNodeId: "",
    selectedFlowEdgeId: "",
};

const builderElements = {
    cardList: document.getElementById("builder-card-list"),
    search: document.getElementById("builder-search"),
    reloadButton: document.getElementById("builder-reload-button"),
    title: document.getElementById("builder-title"),
    status: document.getElementById("builder-status"),
    fileName: document.getElementById("builder-file-name"),
    completionLabel: document.getElementById("builder-completion-label"),
    completionToggle: document.getElementById("builder-completion-toggle"),
    flowShell: document.getElementById("builder-flow-shell"),
    flowToggle: document.getElementById("builder-flow-toggle"),
    flowStatus: document.getElementById("builder-flow-status"),
    flowFileLabel: document.getElementById("builder-flow-file-label"),
    flowModeLabel: document.getElementById("builder-flow-mode-label"),
    flowCanvas: document.getElementById("builder-flow-canvas"),
    flowDrawflow: document.getElementById("builder-flow-drawflow"),
    flowEmpty: document.getElementById("builder-flow-empty"),
    flowInspectorBody: document.getElementById("builder-flow-inspector-body"),
    flowAddActionButton: document.getElementById("builder-flow-add-action"),
    flowAddDecisionButton: document.getElementById("builder-flow-add-decision"),
    flowConnectButton: document.getElementById("builder-flow-connect"),
    flowDeleteButton: document.getElementById("builder-flow-delete"),
    flowClearButton: document.getElementById("builder-flow-clear"),
    flowReloadButton: document.getElementById("builder-flow-reload"),
    flowSaveButton: document.getElementById("builder-flow-save"),
    structuredEditor: document.getElementById("builder-structured-editor"),
    jsonEditor: document.getElementById("builder-json-editor"),
    newButton: document.getElementById("builder-new-button"),
    saveButton: document.getElementById("builder-save-button"),
    refreshJsonButton: document.getElementById("builder-refresh-json-button"),
};

function builderSetStatus(message, isError = false) {
    builderElements.status.textContent = message;
    builderElements.status.style.background = isError ? "rgba(176, 58, 46, 0.12)" : "rgba(44, 122, 88, 0.12)";
    builderElements.status.style.color = isError ? "#a13329" : "#2c7a58";
}

function setFlowStatus(message, isError = false) {
    builderElements.flowStatus.textContent = message;
    builderElements.flowStatus.style.background = isError ? "rgba(176, 58, 46, 0.12)" : "rgba(44, 122, 88, 0.12)";
    builderElements.flowStatus.style.color = isError ? "#a13329" : "#2c7a58";
}

function getCurrentCardId() {
    const cardId = Number(getCardCore(builderState.currentDocument)?.id);
    if (!Number.isInteger(cardId) || cardId <= 0) {
        return null;
    }
    return cardId;
}

function getCardCompletionStatus(cardId) {
    return Boolean(
        builderState.cards.find((item) => Number(getCardCore(item.card)?.id) === Number(cardId))?.isCompleted,
    );
}

function applyCompletionStatus(cardId, isCompleted) {
    builderState.cards.forEach((item) => {
        if (Number(getCardCore(item.card)?.id) === Number(cardId)) {
            item.isCompleted = isCompleted;
        }
    });
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function formatJson(value) {
    return JSON.stringify(value, null, 2);
}

function getCardCore(document) {
    if (document && typeof document === "object" && !Array.isArray(document) && document.card && typeof document.card === "object") {
        return document.card;
    }
    return document;
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createValueExpr(kind = "NoneValue") {
    if (kind === "ConstValue") return { "$type": TYPE_NAMES.ConstValue, value: 0 };
    if (kind === "VariableValue") return { "$type": TYPE_NAMES.VariableValue, source: 0 };
    if (kind === "BinaryValue") {
        return { "$type": TYPE_NAMES.BinaryValue, left: createValueExpr(), right: createValueExpr(), op: 0 };
    }
    return { "$type": TYPE_NAMES.NoneValue };
}

function createConditionExpr(kind = "AllCondition") {
    if (kind === "CompareCondition") {
        return { "$type": TYPE_NAMES.CompareCondition, left: createValueExpr(), right: createValueExpr(), op: 0 };
    }
    if (kind === "AndCondition") {
        return { "$type": TYPE_NAMES.AndCondition, a: createConditionExpr("AllCondition"), b: createConditionExpr("AllCondition") };
    }
    if (kind === "OddEvenCondition") {
        return { "$type": TYPE_NAMES.OddEvenCondition, left: createValueExpr(), right: createValueExpr() };
    }
    if (kind === "NoneCondition") return { "$type": TYPE_NAMES.NoneCondition };
    return { "$type": TYPE_NAMES.AllCondition };
}

function createSelectionMode(name = "None") {
    return { "$type": `SelectionMode${name}, Assembly-CSharp` };
}

function createParticipantSpec() {
    return {
        participantType: 0,
        filter: createConditionExpr("NoneCondition"),
        participantSelectionMode: createSelectionMode("None"),
        maxSelectCount: createValueExpr(),
    };
}

function createEffect() {
    return {
        type: 0,
        trueNode: -1,
        falseNode: -1,
        source: createParticipantSpec(),
        target: createParticipantSpec(),
        value: createValueExpr(),
    };
}

function createEmptyDocument() {
    return {
        card: {
            id: 0,
            name: "",
            description: "",
            point: 0,
            type: 1,
            count: 1,
            effects: [],
        },
    };
}

function normalizeCardCore(rawCard) {
    const input = isPlainObject(rawCard) ? clone(rawCard) : {};
    const normalized = {
        id: Number(input.id ?? 0),
        name: String(input.name ?? ""),
        description: String(input.description ?? ""),
        point: Number(input.point ?? 0),
        type: Number(input.type ?? 1),
        count: Number(input.count ?? 1),
        effects: Array.isArray(input.effects) ? input.effects : [],
    };
    return normalized;
}

function detectValueExprKind(value) {
    const typeName = value?.["$type"] || "";
    if (typeName.includes("ConstValue")) return "ConstValue";
    if (typeName.includes("VariableValue")) return "VariableValue";
    if (typeName.includes("BinaryValue")) return "BinaryValue";
    return "NoneValue";
}

function detectConditionKind(value) {
    const typeName = value?.["$type"] || "";
    if (typeName.includes("CompareCondition")) return "CompareCondition";
    if (typeName.includes("AndCondition")) return "AndCondition";
    if (typeName.includes("OddEvenCondition")) return "OddEvenCondition";
    if (typeName.includes("NoneCondition")) return "NoneCondition";
    return "AllCondition";
}

function detectSelectionMode(mode) {
    const typeName = mode?.["$type"] || "";
    const match = SELECTION_MODE_OPTIONS.find((name) => typeName.includes(`SelectionMode${name}`));
    return match || "None";
}

function ensureValueExpr(value) {
    const kind = detectValueExprKind(value);
    if (kind === "ConstValue") return { "$type": TYPE_NAMES.ConstValue, value: Number(value?.value ?? 0) };
    if (kind === "VariableValue") return { "$type": TYPE_NAMES.VariableValue, source: Number(value?.source ?? 0) };
    if (kind === "BinaryValue") return { "$type": TYPE_NAMES.BinaryValue, left: ensureValueExpr(value?.left), right: ensureValueExpr(value?.right), op: Number(value?.op ?? 0) };
    return { "$type": TYPE_NAMES.NoneValue };
}

function ensureConditionExpr(value) {
    const kind = detectConditionKind(value);
    if (kind === "CompareCondition") return { "$type": TYPE_NAMES.CompareCondition, left: ensureValueExpr(value?.left), right: ensureValueExpr(value?.right), op: Number(value?.op ?? 0) };
    if (kind === "AndCondition") return { "$type": TYPE_NAMES.AndCondition, a: ensureConditionExpr(value?.a), b: ensureConditionExpr(value?.b) };
    if (kind === "OddEvenCondition") return { "$type": TYPE_NAMES.OddEvenCondition, left: ensureValueExpr(value?.left), right: ensureValueExpr(value?.right) };
    if (kind === "NoneCondition") return { "$type": TYPE_NAMES.NoneCondition };
    return { "$type": TYPE_NAMES.AllCondition };
}

function ensureDocument(document) {
    const input = isPlainObject(document) ? clone(document) : {};
    const next = isPlainObject(input.card) ? input : { card: input };
    const card = normalizeCardCore(next.card);

    if (!Array.isArray(card.effects)) card.effects = [];
    card.effects = card.effects.map((effect) => ({
        type: Number(effect?.type ?? 0),
        trueNode: Number(effect?.trueNode ?? -1),
        falseNode: Number(effect?.falseNode ?? -1),
        source: {
            participantType: Number(effect?.source?.participantType ?? 0),
            filter: ensureConditionExpr(effect?.source?.filter),
            participantSelectionMode: createSelectionMode(detectSelectionMode(effect?.source?.participantSelectionMode)),
            maxSelectCount: ensureValueExpr(effect?.source?.maxSelectCount),
        },
        target: {
            participantType: Number(effect?.target?.participantType ?? 0),
            filter: ensureConditionExpr(effect?.target?.filter),
            participantSelectionMode: createSelectionMode(detectSelectionMode(effect?.target?.participantSelectionMode)),
            maxSelectCount: ensureValueExpr(effect?.target?.maxSelectCount),
        },
        value: ensureValueExpr(effect?.value),
    }));
    next.card = card;
    return next;
}

function getGeneratedFileNameFromDocument(document) {
    const id = Number(getCardCore(document)?.id);
    if (!Number.isInteger(id)) {
        throw new Error("card.id 必须是整数");
    }
    return `card_${id}.json`;
}

function syncFileName() {
    try {
        builderElements.fileName.value = getGeneratedFileNameFromDocument(builderState.currentDocument);
    } catch {
        builderElements.fileName.value = "";
    }
}

function syncCompletionPanel() {
    const cardId = getCurrentCardId();
    if (!cardId) {
        builderElements.completionLabel.textContent = "未选择卡牌";
        builderElements.completionToggle.textContent = "选择卡牌后可切换";
        builderElements.completionToggle.disabled = true;
        builderElements.completionToggle.dataset.completed = "";
        return;
    }

    const isCompleted = getCardCompletionStatus(cardId);
    builderElements.completionLabel.innerHTML = `
        <span class="builder-completion-badge ${isCompleted ? "is-completed" : "is-pending"}">
            ${isCompleted ? "已制作" : "未制作"}
        </span>
        <span>卡牌 ID: ${cardId}</span>
    `;
    builderElements.completionToggle.textContent = isCompleted ? "改为未制作" : "标记为已制作";
    builderElements.completionToggle.disabled = false;
    builderElements.completionToggle.dataset.completed = String(isCompleted);
}

function createEmptyFlow(cardId = 0) {
    return {
        cardId: Number(cardId) > 0 ? Number(cardId) : 0,
        engine: "drawflow",
        drawflow: {
            drawflow: {
                Home: {
                    data: {},
                },
            },
        },
    };
}

function getCurrentFlowCardId() {
    const cardId = getCurrentCardId();
    return cardId && cardId > 0 ? cardId : 0;
}

function sanitizeFlowDocument(flow, cardIdHint = 0) {
    const input = isPlainObject(flow) ? clone(flow) : {};
    const cardId = Number(input.cardId ?? cardIdHint ?? 0);
    const drawflow = isPlainObject(input.drawflow) ? clone(input.drawflow) : createEmptyFlow(cardId).drawflow;
    if (!isPlainObject(drawflow.drawflow)) {
        drawflow.drawflow = { Home: { data: {} } };
    }
    if (!isPlainObject(drawflow.drawflow.Home)) {
        drawflow.drawflow.Home = { data: {} };
    }
    if (!isPlainObject(drawflow.drawflow.Home.data)) {
        drawflow.drawflow.Home.data = {};
    }

    return {
        cardId: cardId > 0 ? cardId : 0,
        engine: "drawflow",
        drawflow,
    };
}

function getFlowPathLabel(cardId) {
    return cardId > 0 ? `data/card_flows/card_flow_${cardId}.json` : "请先设置有效卡牌 ID";
}

function getDrawflowData() {
    return builderState.currentFlow?.drawflow?.drawflow?.Home?.data || {};
}

function getFlowNodeById(nodeId) {
    return getDrawflowData()[String(nodeId)] || null;
}

function getFlowSelectedNodes() {
    return Array.from(builderElements.flowDrawflow.querySelectorAll(".drawflow-node.selected"));
}

function resetFlowSelection() {
    builderState.selectedFlowNodeId = "";
    builderState.selectedFlowEdgeId = "";
}

function syncFlowMeta() {
    const cardId = getCurrentFlowCardId();
    builderElements.flowFileLabel.textContent = getFlowPathLabel(cardId);

    if (builderState.selectedFlowNodeId) {
        builderElements.flowModeLabel.textContent = `模式: 已选中节点 ${builderState.selectedFlowNodeId}`;
    } else if (builderState.selectedFlowEdgeId) {
        builderElements.flowModeLabel.textContent = "模式: 连线编辑中";
    } else {
        builderElements.flowModeLabel.textContent = "模式: 浏览";
    }
}

function setFlowPanelOpen(open) {
    builderState.flowPanelOpen = Boolean(open);
    builderElements.flowShell.classList.toggle("is-collapsed", !builderState.flowPanelOpen);
    builderElements.flowToggle.textContent = builderState.flowPanelOpen ? "隐藏流程图" : "显示流程图";
    builderElements.flowToggle.setAttribute("aria-expanded", builderState.flowPanelOpen ? "true" : "false");
}

function renderFlowInspector() {
    const selectedNode = getFlowNodeById(builderState.selectedFlowNodeId);

    if (!selectedNode) {
        builderElements.flowInspectorBody.innerHTML = `
            <div>当前没有选中节点。</div>
            <div>在 Drawflow 中可直接拖拽节点、拖动连线，并用节点内部输入框修改标题。</div>
        `;
        return;
    }

    const customId = selectedNode.data?.customId || selectedNode.id;
    const label = selectedNode.data?.label || "";
    const kind = selectedNode.data?.kind === "decision" ? "判断" : "方框";
    builderElements.flowInspectorBody.innerHTML = `
        <div class="builder-flow-inspector-grid">
            <label class="editor-field">
                <span>节点 ID</span>
                <input type="text" value="${escapeHtml(String(customId))}" readonly>
            </label>
            <label class="editor-field">
                <span>节点类型</span>
                <input type="text" value="${escapeHtml(kind)}" readonly>
            </label>
            <label class="editor-field">
                <span>X</span>
                <input type="number" value="${escapeHtml(selectedNode.pos_x ?? 0)}" readonly>
            </label>
            <label class="editor-field">
                <span>Y</span>
                <input type="number" value="${escapeHtml(selectedNode.pos_y ?? 0)}" readonly>
            </label>
        </div>
        <label class="editor-field editor-field-wide">
            <span>标题</span>
            <input type="text" data-flow-bind="node.label" value="${escapeHtml(label)}">
        </label>
    `;
}

function getFlowNodeHtml(kind, label) {
    const kindLabel = kind === "decision" ? "判断" : "方框";
    return `
        <div class="builder-drawflow-card ${kind === "decision" ? "is-decision" : "is-action"}">
            <div class="builder-drawflow-card-kind">${kindLabel}</div>
            <input class="builder-drawflow-card-input" type="text" df-label value="${escapeHtml(label)}" placeholder="${kindLabel}">
        </div>
    `;
}

function ensureDrawflowEditor() {
    if (builderState.drawflowReady) {
        return builderState.drawflowEditor;
    }
    if (!window.Drawflow || !builderElements.flowDrawflow) {
        return null;
    }

    const editor = new window.Drawflow(builderElements.flowDrawflow);
    editor.reroute = true;
    editor.editor_mode = "edit";
    editor.start();
    editor.zoom = 1;
    editor.precanvas.style.minWidth = "1400px";
    editor.precanvas.style.minHeight = "900px";

    editor.on("nodeSelected", (id) => {
        builderState.currentFlow = exportFlowFromEditor();
        builderState.selectedFlowNodeId = String(id);
        renderFlowInspector();
        syncFlowMeta();
    });
    editor.on("nodeUnselected", () => {
        builderState.currentFlow = exportFlowFromEditor();
        builderState.selectedFlowNodeId = "";
        renderFlowInspector();
        syncFlowMeta();
    });
    editor.on("nodeRemoved", () => {
        builderState.currentFlow = exportFlowFromEditor();
        builderState.selectedFlowNodeId = "";
        renderFlowInspector();
        syncFlowMeta();
        updateFlowEmptyState();
    });
    editor.on("connectionCreated", () => {
        builderState.currentFlow = exportFlowFromEditor();
        builderState.selectedFlowEdgeId = "";
        syncFlowMeta();
        updateFlowEmptyState();
        setFlowStatus("已创建连线");
    });
    editor.on("connectionRemoved", () => {
        builderState.currentFlow = exportFlowFromEditor();
        syncFlowMeta();
        updateFlowEmptyState();
        setFlowStatus("已移除连线");
    });
    editor.on("nodeCreated", () => {
        builderState.currentFlow = exportFlowFromEditor();
        updateFlowEmptyState();
    });
    editor.on("nodeMoved", () => {
        builderState.currentFlow = exportFlowFromEditor();
        renderFlowInspector();
    });

    builderState.drawflowEditor = editor;
    builderState.drawflowReady = true;
    return editor;
}

function updateFlowEmptyState() {
    const data = getDrawflowData();
    builderElements.flowEmpty.style.display = Object.keys(data).length ? "none" : "block";
}

function importFlowToEditor() {
    const editor = ensureDrawflowEditor();
    if (!editor) {
        setFlowStatus("Drawflow 资源未加载", true);
        return;
    }
    const flow = sanitizeFlowDocument(builderState.currentFlow, getCurrentFlowCardId());
    builderState.currentFlow = flow;
    editor.clear();
    editor.import(clone(flow.drawflow));
    builderState.selectedFlowNodeId = "";
    builderState.selectedFlowEdgeId = "";
    updateFlowEmptyState();
    syncFlowMeta();
    renderFlowInspector();
}

function exportFlowFromEditor() {
    const editor = ensureDrawflowEditor();
    if (!editor) {
        return createEmptyFlow(getCurrentFlowCardId());
    }
    const exported = editor.export();
    return sanitizeFlowDocument(
        {
            cardId: getCurrentFlowCardId(),
            engine: "drawflow",
            drawflow: exported,
        },
        getCurrentFlowCardId(),
    );
}

function renderFlowEditor() {
    syncFlowMeta();
    builderElements.flowConnectButton.disabled = true;
    builderElements.flowDeleteButton.disabled = !builderState.selectedFlowNodeId;
    builderElements.flowSaveButton.disabled = getCurrentFlowCardId() <= 0;
    builderElements.flowReloadButton.disabled = getCurrentFlowCardId() <= 0;
    builderElements.flowClearButton.disabled = !Object.keys(getDrawflowData()).length;
    updateFlowEmptyState();
    renderFlowInspector();
}

async function loadFlowForCurrentCard() {
    const cardId = getCurrentFlowCardId();
    resetFlowSelection();

    if (cardId <= 0) {
        builderState.currentFlow = createEmptyFlow(0);
        setFlowStatus("请先设置卡牌 ID");
        renderFlowEditor();
        return;
    }

    setFlowStatus(`正在读取卡牌 ${cardId} 的流程图...`);
    try {
        const response = await requestJson(`/api/card-flow?cardId=${cardId}`);
        if (getCurrentFlowCardId() !== cardId) {
            return;
        }
        builderState.currentFlow = sanitizeFlowDocument(response.flow, cardId);
        setFlowStatus(`流程图已载入: ${getFlowPathLabel(cardId)}`);
        importFlowToEditor();
        renderFlowEditor();
    } catch (error) {
        if (getCurrentFlowCardId() !== cardId) {
            return;
        }
        builderState.currentFlow = createEmptyFlow(cardId);
        setFlowStatus(error.message, true);
        importFlowToEditor();
        renderFlowEditor();
    }
}

async function saveCurrentFlow(flowOverride = null) {
    const cardId = getCurrentFlowCardId();
    if (cardId <= 0) {
        setFlowStatus("请先设置有效卡牌 ID，再保存流程图。", true);
        return false;
    }

    setFlowStatus(`正在保存卡牌 ${cardId} 的流程图...`);
    try {
        builderState.currentFlow = flowOverride
            ? sanitizeFlowDocument(flowOverride, cardId)
            : exportFlowFromEditor();
        const response = await requestJson("/api/card-flow", {
            method: "POST",
            body: JSON.stringify({
                cardId,
                flow: builderState.currentFlow,
            }),
        });
        builderState.currentFlow = sanitizeFlowDocument(response.flow, cardId);
        setFlowStatus(`流程图已保存到 ${response.path}`);
        importFlowToEditor();
        renderFlowEditor();
        return true;
    } catch (error) {
        setFlowStatus(error.message, true);
        return false;
    }
}

function syncFlowCardIdFromDocument() {
    if (!builderState.currentFlow) {
        builderState.currentFlow = createEmptyFlow(getCurrentFlowCardId());
    } else {
        builderState.currentFlow.cardId = getCurrentFlowCardId();
    }
    renderFlowEditor();
}

function addFlowNode(type) {
    const editor = ensureDrawflowEditor();
    if (!editor) {
        setFlowStatus("Drawflow 资源未加载", true);
        return;
    }
    const isDecision = type === "decision";
    const customId = `${type}_${Date.now()}`;
    const data = {
        label: isDecision ? "判断" : "步骤",
        kind: type,
        customId,
    };
    const posX = 90 + Object.keys(getDrawflowData()).length * 40;
    const posY = 90 + Object.keys(getDrawflowData()).length * 30;
    const drawflowId = editor.addNode(
        type,
        1,
        isDecision ? 2 : 1,
        posX,
        posY,
        isDecision ? "builder-drawflow-decision" : "builder-drawflow-action",
        data,
        getFlowNodeHtml(type, data.label),
    );
    builderState.selectedFlowNodeId = String(drawflowId);
    editor.selectNodeId(String(drawflowId));
    builderState.currentFlow = exportFlowFromEditor();
    renderFlowEditor();
}

function addFlowEdge(sourceId, targetId) {
    void sourceId;
    void targetId;
}

function deleteSelectedFlowItem() {
    const editor = ensureDrawflowEditor();
    if (!editor || !builderState.selectedFlowNodeId) {
        return;
    }
    editor.removeNodeId(`node-${builderState.selectedFlowNodeId}`);
    builderState.currentFlow = exportFlowFromEditor();
    builderState.selectedFlowNodeId = "";
    renderFlowEditor();
    setFlowStatus("已删除当前选中内容");
}

function clearCurrentFlow() {
    const editor = ensureDrawflowEditor();
    if (!editor) {
        return;
    }
    if (!window.confirm("确认清空当前卡牌的流程图吗？")) {
        return;
    }
    builderState.currentFlow = createEmptyFlow(getCurrentFlowCardId());
    resetFlowSelection();
    editor.clear();
    importFlowToEditor();
    renderFlowEditor();
    setFlowStatus("当前流程图已清空");
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || "请求失败");
    }
    return data;
}

function getByPath(root, path) {
    return path.split(".").reduce((current, key) => {
        if (current == null) return undefined;
        return /^\d+$/.test(key) ? current[Number(key)] : current[key];
    }, root);
}

function setByPath(root, path, value) {
    const parts = path.split(".");
    const last = parts.pop();
    const parent = parts.length ? getByPath(root, parts.join(".")) : root;
    if (parent == null || last == null) return;
    if (/^\d+$/.test(last)) parent[Number(last)] = value;
    else parent[last] = value;
}

function renderSelect(options, selected, attrs) {
    return `<select ${attrs}>${options.map((option) => `<option value="${escapeHtml(option.value ?? option)}" ${String(option.value ?? option) === String(selected) ? "selected" : ""}>${escapeHtml(option.label ?? option)}</option>`).join("")}</select>`;
}

function renderInput(path, label, value, kind = "string", type = "text", wide = false) {
    return `<label class="editor-field ${wide ? "editor-field-wide" : ""}"><span>${escapeHtml(label)}</span><input type="${type}" data-bind="${path}" data-kind="${kind}" value="${escapeHtml(value ?? "")}"></label>`;
}

function renderTextarea(path, label, value, rows = 3) {
    return `<label class="editor-field editor-field-wide"><span>${escapeHtml(label)}</span><textarea rows="${rows}" data-bind="${path}" data-kind="string">${escapeHtml(value ?? "")}</textarea></label>`;
}

function renderParticipantFlags(path, value) {
    const current = Number(value ?? 0);
    return `<div class="builder-flag-list">${PARTICIPANT_FLAGS.map((flag) => `<label class="builder-flag-item"><input type="checkbox" data-flag-path="${path}" data-flag="${flag.value}" ${current & flag.value ? "checked" : ""}><span>${escapeHtml(flag.label)}</span></label>`).join("")}</div>`;
}

function countSelectedParticipantFlags(value) {
    const current = Number(value ?? 0);
    return PARTICIPANT_FLAGS.filter((flag) => (current & flag.value) === flag.value).length;
}

function renderParticipantSummary(spec) {
    const selectedFlags = countSelectedParticipantFlags(spec.participantType);
    const selectionMode = detectSelectionMode(spec.participantSelectionMode);
    const conditionKind = detectConditionKind(spec.filter);

    return `
        <div class="builder-participant-summary">
            <span class="builder-participant-chip">${selectedFlags} flags</span>
            <span class="builder-participant-chip">${escapeHtml(selectionMode)}</span>
            <span class="builder-participant-chip">${escapeHtml(conditionKind)}</span>
        </div>
    `;
}

function isParticipantOpen(path) {
    return builderState.participantFoldouts[path] !== false;
}

function renderValueExpr(value, path, title) {
    const kind = detectValueExprKind(value);
    let body = `<div class="builder-static-note">No value</div>`;
    if (kind === "ConstValue") body = renderInput(`${path}.value`, "Value", value.value, "int", "number");
    if (kind === "VariableValue") body = `<label class="editor-field"><span>Source</span>${renderSelect(VALUE_SOURCE_OPTIONS, value.source ?? 0, `data-bind="${path}.source" data-kind="int"`)} </label>`;
    if (kind === "BinaryValue") body = `<label class="editor-field"><span>Op</span>${renderSelect(BINARY_OP_OPTIONS, value.op ?? 0, `data-bind="${path}.op" data-kind="int"`)} </label><div class="builder-nested-columns">${renderValueExpr(value.left, `${path}.left`, "Left")}${renderValueExpr(value.right, `${path}.right`, "Right")}</div>`;
    return `<section class="builder-nested-block"><h4 class="builder-section-heading">${escapeHtml(title)}</h4><label class="editor-field"><span>Value Type</span>${renderSelect(VALUE_EXPR_OPTIONS, kind, `data-value-path="${path}"`)}</label>${body}</section>`;
}

function renderConditionExpr(value, path, title) {
    const kind = detectConditionKind(value);
    let body = `<div class="builder-static-note">${kind === "AllCondition" ? "Always true" : "Always false"}</div>`;
    if (kind === "CompareCondition") body = `<label class="editor-field"><span>Compare Op</span>${renderSelect(COMPARE_OP_OPTIONS, value.op ?? 0, `data-bind="${path}.op" data-kind="int"`)} </label><div class="builder-nested-columns">${renderValueExpr(value.left, `${path}.left`, "Left")}${renderValueExpr(value.right, `${path}.right`, "Right")}</div>`;
    if (kind === "AndCondition") body = `<div class="builder-nested-columns">${renderConditionExpr(value.a, `${path}.a`, "A")}${renderConditionExpr(value.b, `${path}.b`, "B")}</div>`;
    if (kind === "OddEvenCondition") body = `<div class="builder-nested-columns">${renderValueExpr(value.left, `${path}.left`, "Left")}${renderValueExpr(value.right, `${path}.right`, "Right")}</div>`;
    return `<section class="builder-nested-block"><h4 class="builder-section-heading">${escapeHtml(title)}</h4><label class="editor-field"><span>Condition Type</span>${renderSelect(CONDITION_EXPR_OPTIONS, kind, `data-condition-path="${path}"`)}</label>${body}</section>`;
}

function renderParticipantSpec(spec, path, title) {
    const open = isParticipantOpen(path);
    return `
        <section class="builder-participant-card">
            <button class="builder-participant-toggle" type="button" data-action="toggle-participant" data-path="${path}">
                <span class="builder-participant-toggle-title">${open ? "▾" : "▸"} ${escapeHtml(title)}</span>
                ${renderParticipantSummary(spec)}
            </button>
            ${open ? `
                <div class="builder-participant-body">
                    <div class="builder-participant-top">
                        <div class="builder-participant-main">
                            ${renderInput(`${path}.participantType`, "Participant Type (Flags)", spec.participantType, "int", "number")}
                            <label class="editor-field"><span>Selection Mode</span>${renderSelect(SELECTION_MODE_OPTIONS, detectSelectionMode(spec.participantSelectionMode), `data-selection-path="${path}.participantSelectionMode"`)} </label>
                        </div>
                        <div class="builder-participant-side">
                            <div class="builder-flag-wrap">
                                <span class="builder-mini-label">Flags</span>
                                ${renderParticipantFlags(`${path}.participantType`, spec.participantType)}
                            </div>
                        </div>
                    </div>
                    <div class="builder-participant-bottom">
                        ${renderConditionExpr(spec.filter, `${path}.filter`, "Filter (Condition)")}
                        ${renderValueExpr(spec.maxSelectCount, `${path}.maxSelectCount`, "Max Select Count")}
                    </div>
                </div>
            ` : ""}
        </section>
    `;
}

function renderEffect(effect, index) {
    const open = builderState.effectFoldouts[index] !== false;
    return `<article class="builder-effect-card"><div class="builder-effect-header"><button class="builder-fold-button" type="button" data-action="toggle-effect" data-index="${index}">${open ? "▾" : "▸"} Effect #${index} [${escapeHtml(EFFECT_TYPE_OPTIONS.find((item) => item.value === effect.type)?.label || effect.type)}]</button><div class="builder-effect-actions"><button class="ghost-button" type="button" data-action="move-up" data-index="${index}" ${index === 0 ? "disabled" : ""}>↑</button><button class="ghost-button" type="button" data-action="move-down" data-index="${index}" ${index === getCardCore(builderState.currentDocument).effects.length - 1 ? "disabled" : ""}>↓</button><button class="ghost-button builder-delete-button" type="button" data-action="remove-effect" data-index="${index}">X</button></div></div>${open ? `<div class="builder-effect-body"><div class="builder-subgrid"><label class="editor-field"><span>Type</span>${renderSelect(EFFECT_TYPE_OPTIONS, effect.type, `data-bind="card.effects.${index}.type" data-kind="int"`)} </label>${renderInput(`card.effects.${index}.trueNode`, "TrueNode", effect.trueNode, "int", "number")}${renderInput(`card.effects.${index}.falseNode`, "FalseNode", effect.falseNode, "int", "number")}</div>${renderParticipantSpec(effect.source, `card.effects.${index}.source`, "Source")}${renderParticipantSpec(effect.target, `card.effects.${index}.target`, "Target")}${renderValueExpr(effect.value, `card.effects.${index}.value`, "Value")}</div>` : ""}</article>`;
}

function validateCurrentDocument() {
    const card = getCardCore(builderState.currentDocument);
    const errors = [];
    if (!card) return ["card is missing"];
    if (Number(card.id) <= 0) errors.push("id should be > 0");
    if (!String(card.name || "").trim()) errors.push("name is empty");
    if (Number(card.count) < 0) errors.push("count should be >= 0");
    (card.effects || []).forEach((effect, index) => {
        if (!effect) errors.push(`effects[${index}] is null`);
        else {
            if (!effect.value) errors.push(`effects[${index}].value is null`);
            if (!effect.target) errors.push(`effects[${index}].target is null`);
        }
    });
    return errors;
}

function renderValidationBox() {
    const errors = validateCurrentDocument();
    if (!errors.length) {
        return `<div class="builder-validation builder-validation-ok">OK: Card looks valid.</div>`;
    }
    return `<div class="builder-validation builder-validation-warn"><strong>Warnings</strong><ul class="builder-validation-list">${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul></div>`;
}

function ensureFoldouts() {
    const effects = getCardCore(builderState.currentDocument)?.effects || [];
    while (builderState.effectFoldouts.length < effects.length) builderState.effectFoldouts.push(true);
    while (builderState.effectFoldouts.length > effects.length) builderState.effectFoldouts.pop();
}

function renderStructuredEditor() {
    if (!builderState.currentDocument) {
        builderElements.structuredEditor.innerHTML = "";
        return;
    }
    ensureFoldouts();
    const card = getCardCore(builderState.currentDocument);
    builderElements.structuredEditor.innerHTML = `
        <section class="builder-card-block">
            <h3 class="builder-block-title">Card Base Info</h3>
            <div class="editor-grid">
                ${renderInput("card.id", "ID", card.id, "int", "number")}
                ${renderInput("card.name", "Name", card.name)}
                ${renderTextarea("card.description", "Description", card.description, 2)}
                <label class="editor-field"><span>Type</span>${renderSelect(CARD_TYPE_OPTIONS, card.type ?? 1, 'data-bind="card.type" data-kind="int"')} </label>
                ${renderInput("card.point", "Point", card.point, "int", "number")}
                ${renderInput("card.count", "Count (in deck)", card.count, "int", "number")}
            </div>
        </section>
        <section class="builder-card-block">
            <div class="panel-header builder-inline-header">
                <div><p class="panel-kicker">Effects</p><h2>Effects</h2></div>
                <div class="builder-toolbar"><button class="secondary-button" type="button" data-action="add-effect">+ Add Effect</button><button class="secondary-button" type="button" data-action="clear-effects">Clear Effects</button></div>
            </div>
            ${card.effects.length ? card.effects.map((effect, index) => renderEffect(effect, index)).join("") : '<div class="builder-static-note">No effects yet. Click "+ Add Effect".</div>'}
        </section>
        <section class="builder-card-block">
            <h3 class="builder-block-title">Validation</h3>
            ${renderValidationBox()}
        </section>`;
}

function setCurrentDocument(document, fileName = "", options = {}) {
    const { reloadFlow = true } = options;
    builderState.currentDocument = ensureDocument(document);
    builderState.selectedFileName = fileName;
    builderState.effectFoldouts = [];
    builderState.participantFoldouts = {};
    syncFileName();
    syncCompletionPanel();
    builderElements.title.textContent = fileName || "新建卡牌";
    builderElements.jsonEditor.value = formatJson(builderState.currentDocument);
    renderStructuredEditor();
    renderBuilderCardList();
    if (reloadFlow) {
        loadFlowForCurrentCard();
    }
}

function renderCardGroup(title, items, emptyCopy) {
    const groupKey = title === "未制作" ? "pending" : "completed";
    const open = builderState.cardGroupFoldouts[groupKey] !== false;
    return `
        <section class="builder-card-group">
            <button class="builder-card-group-header" type="button" data-action="toggle-card-group" data-group="${groupKey}">
                <span class="builder-card-group-title">${open ? "▾" : "▸"} ${escapeHtml(title)}</span>
                <span>${items.length}</span>
            </button>
            ${open ? (items.length ? items.map((item) => {
                const core = getCardCore(item.card) || {};
                const isCompleted = Boolean(item.isCompleted);
                return `
                    <article class="card-tile ${builderState.selectedFileName === item.fileName ? "is-selected" : ""}" data-file-name="${item.fileName}">
                        <div class="card-tile-header">
                            <div>
                                <div class="builder-card-topline">
                                    <h3 class="card-title">${escapeHtml(item.name)}</h3>
                                    <span class="builder-completion-badge ${isCompleted ? "is-completed" : "is-pending"}">${isCompleted ? "已制作" : "未制作"}</span>
                                </div>
                                <div class="card-file">${escapeHtml(item.fileName)}</div>
                            </div>
                            <div class="builder-card-actions">
                <button class="ghost-button builder-status-toggle builder-compact-button" type="button" data-toggle-completion="${core.id}" data-target-completion="${isCompleted ? "false" : "true"}">${isCompleted ? "设为未制作" : "设为已制作"}</button>
                <button class="ghost-button builder-delete-button builder-compact-button" type="button" data-delete-file="${item.fileName}">删除</button>
                            </div>
                        </div>
                        <div class="card-summary">${escapeHtml(`id: ${core.id ?? "-"} | type: ${core.type ?? "-"} | point: ${core.point ?? "-"}`)}</div>
                    </article>
                `;
            }).join("") : `<div class="builder-group-empty">${escapeHtml(emptyCopy)}</div>`) : ""}
        </section>
    `;
}

function renderBuilderCardList() {
    const keyword = builderState.filterText.trim().toLowerCase();
    const filteredCards = builderState.cards.filter((item) => {
        if (!keyword) return true;
        const core = getCardCore(item.card);
        return [item.fileName, item.name, core?.description || ""].join(" ").toLowerCase().includes(keyword);
    });
    if (!filteredCards.length) {
        builderElements.cardList.innerHTML = `<div class="empty-state"><strong>没有匹配到卡牌文件</strong><div>可以新建一张卡，或调整搜索词。</div></div>`;
        return;
    }
    const completedCards = filteredCards.filter((item) => item.isCompleted);
    const pendingCards = filteredCards.filter((item) => !item.isCompleted);

    builderElements.cardList.innerHTML = `
        ${renderCardGroup("未制作", pendingCards, "当前搜索结果里没有未制作卡牌。")}
        ${renderCardGroup("已制作", completedCards, "当前搜索结果里没有已制作卡牌。")}
    `;
}

async function loadCards() {
    builderSetStatus("正在读取卡牌文件...");
    try {
        const response = await requestJson("/api/cards");
        builderState.cards = response.cards;
        syncCompletionPanel();
        renderBuilderCardList();
        builderSetStatus("卡牌文件已加载");
    } catch (error) {
        builderSetStatus(error.message, true);
    }
}

async function loadCardFile(fileName) {
    builderSetStatus(`正在读取 ${fileName} ...`);
    try {
        const response = await requestJson(`/api/card-file?fileName=${encodeURIComponent(fileName)}`);
        setCurrentDocument(response.document, response.fileName);
        builderSetStatus(`${response.fileName} 已载入`);
    } catch (error) {
        builderSetStatus(error.message, true);
    }
}

async function saveCurrentCard(options = {}) {
    const { reloadFlow = true } = options;
    try {
        builderElements.fileName.value = getGeneratedFileNameFromDocument(builderState.currentDocument);
    } catch (error) {
        builderSetStatus(error.message, true);
        return null;
    }
    builderSetStatus(`正在保存 ${builderElements.fileName.value} ...`);
    try {
        const response = await requestJson("/api/card-file/save", {
            method: "POST",
            body: JSON.stringify({ currentFileName: builderState.selectedFileName, document: builderState.currentDocument }),
        });
        await loadCards();
        setCurrentDocument(response.card.card, response.card.fileName, { reloadFlow });
        builderSetStatus(`${response.card.fileName} 已保存到 data/cards`);
        return response.card;
    } catch (error) {
        builderSetStatus(error.message, true);
        return null;
    }
}

async function saveCardAndFlow() {
    const flowSnapshot = exportFlowFromEditor();
    const savedCard = await saveCurrentCard({ reloadFlow: false });
    if (!savedCard) {
        return;
    }

    const targetCardId = getCurrentFlowCardId();
    const flowToSave = sanitizeFlowDocument(
        {
            ...flowSnapshot,
            cardId: targetCardId,
        },
        targetCardId,
    );
    builderState.currentFlow = flowToSave;
    importFlowToEditor();

    const flowSaved = await saveCurrentFlow(flowToSave);
    if (flowSaved) {
        builderSetStatus(`${savedCard.fileName} 和流程图已一起保存`);
    }
}

async function deleteCardFile(fileName) {
    if (!fileName) return;
    if (!window.confirm(`确认删除 ${fileName} 吗？此操作不可撤销。`)) return;
    builderSetStatus(`正在删除 ${fileName} ...`);
    try {
        await requestJson(`/api/card-file?fileName=${encodeURIComponent(fileName)}`, { method: "DELETE" });
        if (builderState.selectedFileName === fileName) {
            setCurrentDocument(createEmptyDocument(), "");
        }
        await loadCards();
        builderSetStatus(`${fileName} 已删除`);
    } catch (error) {
        builderSetStatus(error.message, true);
    }
}

async function updateCardCompletion(cardId, isCompleted) {
    builderSetStatus(`正在更新卡牌 ${cardId} 的制作状态...`);
    try {
        const response = await requestJson("/api/card-completion", {
            method: "POST",
            body: JSON.stringify({ cardId, isCompleted }),
        });
        applyCompletionStatus(response.cardId, response.isCompleted);
        syncCompletionPanel();
        renderBuilderCardList();
        builderSetStatus(`卡牌 ${response.cardId} 已标记为${response.isCompleted ? "已制作" : "未制作"}`);
    } catch (error) {
        builderSetStatus(error.message, true);
    }
}

function swapEffects(a, b) {
    const effects = getCardCore(builderState.currentDocument).effects;
    [effects[a], effects[b]] = [effects[b], effects[a]];
    [builderState.effectFoldouts[a], builderState.effectFoldouts[b]] = [builderState.effectFoldouts[b], builderState.effectFoldouts[a]];
}

builderElements.cardList.addEventListener("click", (event) => {
    const groupToggle = event.target.closest("[data-action='toggle-card-group']");
    if (groupToggle) {
        const group = groupToggle.dataset.group;
        if (group) {
            builderState.cardGroupFoldouts[group] = !(builderState.cardGroupFoldouts[group] !== false);
            renderBuilderCardList();
        }
        return;
    }
    const completionButton = event.target.closest("[data-toggle-completion]");
    if (completionButton) {
        updateCardCompletion(
            Number(completionButton.dataset.toggleCompletion),
            completionButton.dataset.targetCompletion === "true",
        );
        return;
    }
    const deleteButton = event.target.closest("[data-delete-file]");
    if (deleteButton) {
        deleteCardFile(deleteButton.dataset.deleteFile);
        return;
    }
    const tile = event.target.closest("[data-file-name]");
    if (tile) {
        loadCardFile(tile.dataset.fileName);
    }
});

builderElements.structuredEditor.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget || !builderState.currentDocument) return;
    const action = actionTarget.dataset.action;
    const index = Number(actionTarget.dataset.index);
    const effects = getCardCore(builderState.currentDocument).effects;

    if (action === "toggle-participant") {
        const path = actionTarget.dataset.path;
        if (!path) return;
        builderState.participantFoldouts[path] = !isParticipantOpen(path);
        renderStructuredEditor();
    } else if (action === "add-effect") {
        effects.push(createEffect());
        builderState.effectFoldouts.push(true);
        renderStructuredEditor();
    } else if (action === "clear-effects") {
        if (window.confirm("确认清空所有 effects 吗？")) {
            getCardCore(builderState.currentDocument).effects = [];
            builderState.effectFoldouts = [];
            renderStructuredEditor();
        }
    } else if (action === "toggle-effect") {
        builderState.effectFoldouts[index] = !builderState.effectFoldouts[index];
        renderStructuredEditor();
    } else if (action === "move-up" && index > 0) {
        swapEffects(index, index - 1);
        renderStructuredEditor();
    } else if (action === "move-down" && index < effects.length - 1) {
        swapEffects(index, index + 1);
        renderStructuredEditor();
    } else if (action === "remove-effect") {
        effects.splice(index, 1);
        builderState.effectFoldouts.splice(index, 1);
        renderStructuredEditor();
    }
    builderElements.jsonEditor.value = formatJson(builderState.currentDocument);
});

builderElements.structuredEditor.addEventListener("input", (event) => {
    if (!builderState.currentDocument) return;
    const bindPath = event.target.dataset.bind;
    if (!bindPath) return;
    let value = event.target.value;
    if (event.target.dataset.kind === "int") {
        value = value === "" ? 0 : Number(value);
        if (Number.isNaN(value)) value = 0;
    }
    setByPath(builderState.currentDocument, bindPath, value);
    syncFileName();
    if (bindPath === "card.id") {
        syncCompletionPanel();
        syncFlowCardIdFromDocument();
    }
    builderElements.jsonEditor.value = formatJson(builderState.currentDocument);
});

builderElements.structuredEditor.addEventListener("change", (event) => {
    if (!builderState.currentDocument) return;
    if (event.target.dataset.bind) {
        let value = event.target.value;
        if (event.target.dataset.kind === "int") {
            value = value === "" ? 0 : Number(value);
            if (Number.isNaN(value)) value = 0;
        }
        setByPath(builderState.currentDocument, event.target.dataset.bind, value);
        if (event.target.dataset.bind === "card.id") {
            syncCompletionPanel();
            syncFlowCardIdFromDocument();
        }
        if (String(event.target.dataset.bind).endsWith(".participantType")) {
            renderStructuredEditor();
        }
    } else if (event.target.dataset.valuePath) {
        setByPath(builderState.currentDocument, event.target.dataset.valuePath, createValueExpr(event.target.value));
        renderStructuredEditor();
    } else if (event.target.dataset.conditionPath) {
        setByPath(builderState.currentDocument, event.target.dataset.conditionPath, createConditionExpr(event.target.value));
        renderStructuredEditor();
    } else if (event.target.dataset.selectionPath) {
        setByPath(builderState.currentDocument, event.target.dataset.selectionPath, createSelectionMode(event.target.value));
        renderStructuredEditor();
    } else if (event.target.dataset.flagPath) {
        const path = event.target.dataset.flagPath;
        const flag = Number(event.target.dataset.flag);
        let current = Number(getByPath(builderState.currentDocument, path) ?? 0);
        current = event.target.checked ? (current | flag) : (current & ~flag);
        setByPath(builderState.currentDocument, path, current);
        renderStructuredEditor();
    } else {
        return;
    }
    syncFileName();
    builderElements.jsonEditor.value = formatJson(builderState.currentDocument);
});

builderElements.search.addEventListener("input", (event) => {
    builderState.filterText = event.target.value;
    renderBuilderCardList();
});

builderElements.flowInspectorBody.addEventListener("input", (event) => {
    const bind = event.target.dataset.flowBind;
    if (!bind || !builderState.currentFlow) {
        return;
    }
    const selectedNode = getFlowNodeById(builderState.selectedFlowNodeId);
    if (bind === "node.label" && selectedNode) {
        selectedNode.data = selectedNode.data || {};
        selectedNode.data.label = event.target.value;
        const input = builderElements.flowDrawflow.querySelector(`#node-${builderState.selectedFlowNodeId} [df-label]`);
        if (input) {
            input.value = event.target.value;
        }
        builderState.currentFlow = exportFlowFromEditor();
        renderFlowInspector();
    }
});

builderElements.reloadButton.addEventListener("click", () => loadCards());
builderElements.newButton.addEventListener("click", () => {
    setCurrentDocument(createEmptyDocument(), "");
    builderSetStatus("已生成空白卡模板");
});
builderElements.completionToggle.addEventListener("click", () => {
    const cardId = getCurrentCardId();
    if (!cardId) {
        builderSetStatus("请先选择或保存一张卡牌", true);
        return;
    }
    updateCardCompletion(cardId, builderElements.completionToggle.dataset.completed !== "true");
});
builderElements.saveButton.addEventListener("click", () => saveCardAndFlow());
builderElements.refreshJsonButton.addEventListener("click", () => {
    builderElements.jsonEditor.value = formatJson(builderState.currentDocument);
    builderSetStatus("JSON 已刷新");
});
builderElements.flowAddActionButton.addEventListener("click", () => {
    addFlowNode("action");
    setFlowStatus("已添加方框节点");
});
builderElements.flowAddDecisionButton.addEventListener("click", () => {
    addFlowNode("decision");
    setFlowStatus("已添加判断节点");
});
builderElements.flowConnectButton.addEventListener("click", () => {
    setFlowStatus("Drawflow 使用原生交互连线：从节点右侧输出端拖到目标节点左侧输入端。");
});
builderElements.flowDeleteButton.addEventListener("click", () => {
    deleteSelectedFlowItem();
});
builderElements.flowClearButton.addEventListener("click", () => {
    clearCurrentFlow();
});
builderElements.flowReloadButton.addEventListener("click", () => {
    loadFlowForCurrentCard();
});
builderElements.flowSaveButton.addEventListener("click", () => {
    saveCurrentFlow();
});

builderElements.flowToggle.addEventListener("click", () => {
    setFlowPanelOpen(!builderState.flowPanelOpen);
});

setFlowPanelOpen(false);
setCurrentDocument(createEmptyDocument(), "");
loadCards();
