const gameConfigState = {
    localPath: "data/GameConfig.json",
    serverPath: "/home/ubuntu/CardGameForLinux/CardGameServer_Data/StreamingAssets/GameConfig.json",
    config: {},
};

const pointCardsState = {
    localPath: "data/PointCards.json",
    serverPath: "/home/ubuntu/CardGameForLinux/CardGameServer_Data/StreamingAssets/PointCards.json",
    document: { cards: [] },
};

const effectAnimationOptionsState = {
    localPath: "data/EffectAnimationOptions.json",
    document: { options: [] },
    effectTypes: [],
    autosaveTimer: null,
    flashIndex: null,
    flashTimer: null,
};

const gameConfigElements = {
    structuredEditor: document.getElementById("game-config-structured-editor"),
    preview: document.getElementById("game-config-preview"),
    status: document.getElementById("game-config-status"),
    localPath: document.getElementById("game-config-local-path"),
    serverPath: document.getElementById("game-config-server-path"),
    reloadButton: document.getElementById("game-config-reload-button"),
    saveButton: document.getElementById("game-config-save-button"),
    fetchServerButton: document.getElementById("game-config-fetch-server-button"),
    uploadServerButton: document.getElementById("game-config-upload-server-button"),
};

const pointCardsElements = {
    structuredEditor: document.getElementById("point-cards-structured-editor"),
    preview: document.getElementById("point-cards-preview"),
    status: document.getElementById("point-cards-status"),
    localPath: document.getElementById("point-cards-local-path"),
    serverPath: document.getElementById("point-cards-server-path"),
    reloadButton: document.getElementById("point-cards-reload-button"),
    saveButton: document.getElementById("point-cards-save-button"),
    fetchServerButton: document.getElementById("point-cards-fetch-server-button"),
    uploadServerButton: document.getElementById("point-cards-upload-server-button"),
};

const effectAnimationOptionsElements = {
    structuredEditor: document.getElementById("effect-animation-options-structured-editor"),
    preview: document.getElementById("effect-animation-options-preview"),
    status: document.getElementById("effect-animation-options-status"),
    localPath: document.getElementById("effect-animation-options-local-path"),
};

function formatJson(value) {
    return JSON.stringify(value, null, 2);
}

function cloneValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function humanizeKey(key) {
    return String(key)
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replaceAll("_", " ")
        .trim();
}

function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.style.background = isError
        ? "rgba(176, 58, 46, 0.12)"
        : "rgba(44, 122, 88, 0.12)";
    element.style.color = isError ? "#a13329" : "#2c7a58";
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
        },
        ...options,
    });
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "请求失败");
    }

    return data;
}

function isNumericPathSegment(segment) {
    return /^\d+$/.test(segment);
}

function setByPath(root, path, value) {
    const keys = path.split(".");
    let current = root;

    for (let index = 0; index < keys.length - 1; index += 1) {
        const key = keys[index];
        const nextKey = keys[index + 1];

        if (Array.isArray(current)) {
            const numericKey = Number(key);
            if (!current[numericKey] || typeof current[numericKey] !== "object") {
                current[numericKey] = isNumericPathSegment(nextKey) ? [] : {};
            }
            current = current[numericKey];
            continue;
        }

        if (!current[key] || typeof current[key] !== "object") {
            current[key] = isNumericPathSegment(nextKey) ? [] : {};
        }

        current = current[key];
    }

    const finalKey = keys[keys.length - 1];
    if (Array.isArray(current) && isNumericPathSegment(finalKey)) {
        current[Number(finalKey)] = value;
        return;
    }

    current[finalKey] = value;
}

function updateGameConfigPreview() {
    gameConfigElements.preview.textContent = formatJson(gameConfigState.config);
}

function renderLeafField(path, key, value) {
    const label = escapeHtml(humanizeKey(key));

    if (typeof value === "number") {
        const step = Number.isInteger(value) ? "1" : "0.01";
        return `
            <label class="editor-field">
                <span>${label}</span>
                <input type="number" step="${step}" data-config-path="${escapeHtml(path)}" data-config-type="number" value="${escapeHtml(value)}">
            </label>
        `;
    }

    if (typeof value === "boolean") {
        return `
            <label class="editor-field config-checkbox-field">
                <span>${label}</span>
                <input type="checkbox" data-config-path="${escapeHtml(path)}" data-config-type="boolean" ${value ? "checked" : ""}>
            </label>
        `;
    }

    if (Array.isArray(value) || (value && typeof value === "object")) {
        return `
            <label class="editor-field editor-field-wide">
                <span>${label}</span>
                <textarea rows="4" data-config-path="${escapeHtml(path)}" data-config-type="json">${escapeHtml(formatJson(value))}</textarea>
            </label>
        `;
    }

    return `
        <label class="editor-field">
            <span>${label}</span>
            <input type="text" data-config-path="${escapeHtml(path)}" data-config-type="string" value="${escapeHtml(value ?? "")}">
        </label>
    `;
}

function renderConfigGroup(title, entriesMarkup, depth = 0) {
    const sectionClass = depth === 0 ? "builder-card-block" : "builder-card-block config-section-block";
    return `
        <section class="${sectionClass}">
            <h3 class="builder-block-title">${escapeHtml(title)}</h3>
            <div class="editor-grid config-editor-fields">
                ${entriesMarkup}
            </div>
        </section>
    `;
}

function renderConfigNode(key, value, pathPrefix = "", depth = 0) {
    const nextPath = pathPrefix ? `${pathPrefix}.${key}` : key;

    if (value && typeof value === "object" && !Array.isArray(value)) {
        const childEntries = Object.entries(value)
            .map(([childKey, childValue]) => renderConfigNode(childKey, childValue, nextPath, depth + 1))
            .join("");

        return renderConfigGroup(humanizeKey(key), childEntries, depth);
    }

    return renderLeafField(nextPath, key, value);
}

function renderGameConfigEditor() {
    const entries = Object.entries(gameConfigState.config || {});

    if (!entries.length) {
        gameConfigElements.structuredEditor.innerHTML = `
            <div class="empty-state">
                <strong>当前没有可编辑配置</strong>
                <div>先从本地读取或从服务器获取一份 GameConfig.json。</div>
            </div>
        `;
        updateGameConfigPreview();
        return;
    }

    gameConfigElements.structuredEditor.innerHTML = entries
        .map(([key, value]) => renderConfigNode(key, value))
        .join("");

    updateGameConfigPreview();
}

function applyGameConfigDocument(response) {
    gameConfigState.localPath = response.localPath || gameConfigState.localPath;
    gameConfigState.serverPath = response.targetPath || gameConfigState.serverPath;

    if (response.config !== undefined) {
        gameConfigState.config = cloneValue(response.config);
    }

    gameConfigElements.localPath.textContent = gameConfigState.localPath;
    gameConfigElements.serverPath.textContent = gameConfigState.serverPath;
    renderGameConfigEditor();
}

function readCurrentGameConfig() {
    return cloneValue(gameConfigState.config);
}

async function loadLocalGameConfig() {
    setStatus(gameConfigElements.status, "正在读取本地 GameConfig.json ...");

    try {
        const response = await requestJson("/api/game-config");
        applyGameConfigDocument(response);
        setStatus(gameConfigElements.status, "本地 GameConfig.json 已载入");
    } catch (error) {
        setStatus(gameConfigElements.status, error.message, true);
    }
}

async function saveLocalGameConfig() {
    setStatus(gameConfigElements.status, "正在保存本地 GameConfig.json ...");

    try {
        const response = await requestJson("/api/game-config", {
            method: "POST",
            body: JSON.stringify({ config: readCurrentGameConfig() }),
        });
        applyGameConfigDocument(response);
        setStatus(gameConfigElements.status, "本地 GameConfig.json 已保存");
    } catch (error) {
        setStatus(gameConfigElements.status, error.message, true);
    }
}

async function uploadGameConfigToServer() {
    setStatus(gameConfigElements.status, "正在上传 GameConfig.json 到游戏服务器 ...");

    try {
        const response = await requestJson("/api/game-config/upload-game-server", {
            method: "POST",
            body: JSON.stringify({ config: readCurrentGameConfig() }),
        });
        applyGameConfigDocument(response);
        setStatus(gameConfigElements.status, `已上传到游戏服务器: ${response.targetPath}`);
    } catch (error) {
        setStatus(gameConfigElements.status, error.message, true);
    }
}

async function fetchGameConfigFromServer() {
    setStatus(gameConfigElements.status, "正在从游戏服务器获取 GameConfig.json ...");

    try {
        const response = await requestJson("/api/game-config/fetch-game-server", {
            method: "POST",
        });
        applyGameConfigDocument(response);
        setStatus(gameConfigElements.status, `已从游戏服务器获取: ${response.targetPath}`);
    } catch (error) {
        setStatus(gameConfigElements.status, error.message, true);
    }
}

function updatePointCardsPreview() {
    pointCardsElements.preview.textContent = formatJson(pointCardsState.document);
}

function renderPointCard(card, index) {
    const count = Number(card.count ?? 0);

    return `
        <section class="point-card-slider-row" data-point-card-index="${index}">
            <div class="point-card-slider-meta">
                <span class="point-card-slider-point">P${escapeHtml(card.point ?? index + 1)}</span>
                <span class="point-card-slider-id">ID ${escapeHtml(card.id ?? "")}</span>
            </div>
            <div class="point-card-slider-track-wrap">
                <input
                    class="point-card-range"
                    type="range"
                    min="0"
                    max="20"
                    step="1"
                    data-point-card-path="cards.${index}.count"
                    data-point-card-type="number"
                    value="${escapeHtml(count)}"
                >
            </div>
            <div class="point-card-slider-value" data-point-card-count-value="${index}">${escapeHtml(count)}</div>
        </section>
    `;
}

function updatePointCardCountDisplay(index, value) {
    const node = pointCardsElements.structuredEditor.querySelector(`[data-point-card-count-value="${index}"]`);
    if (node) {
        node.textContent = String(value);
    }
}

function extractPointCardIndex(path) {
    const match = /^cards\.(\d+)\.count$/.exec(path);
    return match ? Number(match[1]) : null;
}

function renderPointCardsEditor() {
    const cards = Array.isArray(pointCardsState.document?.cards) ? pointCardsState.document.cards : [];

    if (!cards.length) {
        pointCardsElements.structuredEditor.innerHTML = `
            <div class="empty-state">
                <strong>当前没有点数牌</strong>
                <div>可以先从服务器获取 PointCards.json。</div>
            </div>
        `;
        updatePointCardsPreview();
        return;
    }

    pointCardsElements.structuredEditor.innerHTML = `
        <section class="builder-card-block point-cards-slider-panel">
            <div class="panel-header point-cards-chart-header">
                <div>
                    <p class="panel-kicker">Point Card Counts</p>
                    <h2>1 - 10 点数牌数量</h2>
                </div>
                <div class="point-cards-chart-scale">拖动滑杆调整 count</div>
            </div>
            <div class="point-cards-slider-grid">
                ${cards.map((card, index) => renderPointCard(card, index)).join("")}
            </div>
        </section>
    `;

    updatePointCardsPreview();
}

function applyPointCardsDocument(response) {
    pointCardsState.localPath = response.localPath || pointCardsState.localPath;
    pointCardsState.serverPath = response.targetPath || pointCardsState.serverPath;

    if (response.document !== undefined) {
        pointCardsState.document = cloneValue(response.document);
    }

    pointCardsElements.localPath.textContent = pointCardsState.localPath;
    pointCardsElements.serverPath.textContent = pointCardsState.serverPath;
    renderPointCardsEditor();
}

function readCurrentPointCardsDocument() {
    return cloneValue(pointCardsState.document);
}

function updateEffectAnimationOptionsPreview() {
    effectAnimationOptionsElements.preview.textContent = formatJson(effectAnimationOptionsState.document);
}

function splitEffectAnimationLabel(label) {
    const normalizedLabel = String(label || "").trim();
    const separatorIndex = normalizedLabel.indexOf("_");

    if (separatorIndex === -1) {
        return {
            effectTypeLabel: normalizedLabel,
            animationName: "",
        };
    }

    return {
        effectTypeLabel: normalizedLabel.slice(0, separatorIndex),
        animationName: normalizedLabel.slice(separatorIndex + 1),
    };
}

function getEffectTypeLabelFromValue(value) {
    const match = effectAnimationOptionsState.effectTypes.find((option) => Number(option.value) === Number(value));
    return match ? match.label : "";
}

function getEffectTypeValueFromLabel(label) {
    const match = effectAnimationOptionsState.effectTypes.find((option) => option.label === label);
    return match ? Number(match.value) : null;
}

function composeEffectAnimationLabel(effectTypeValue, animationName) {
    const effectTypeLabel = getEffectTypeLabelFromValue(effectTypeValue);
    const normalizedAnimationName = String(animationName || "").trim();
    return effectTypeLabel && normalizedAnimationName
        ? `${effectTypeLabel}_${normalizedAnimationName}`
        : effectTypeLabel;
}

function renumberEffectAnimationOptions() {
    const options = Array.isArray(effectAnimationOptionsState.document?.options)
        ? effectAnimationOptionsState.document.options
        : [];

    options.forEach((option, index) => {
        option.value = index;
    });
}

function renderEffectAnimationInsertGap(index, isEmpty = false) {
    return `
        <button
            class="effect-animation-insert-gap ${isEmpty ? "is-empty" : ""}"
            type="button"
            data-effect-animation-insert="${index}"
        >
            <span class="effect-animation-insert-line"></span>
            <span class="effect-animation-insert-core" aria-hidden="true">+</span>
            <span class="effect-animation-insert-line"></span>
        </button>
    `;
}

function renderEffectAnimationOptionRow(option, index) {
    const parsedLabel = splitEffectAnimationLabel(option.label);
    const selectedEffectTypeValue = getEffectTypeValueFromLabel(parsedLabel.effectTypeLabel);
    const fallbackEffectTypeValue = effectAnimationOptionsState.effectTypes[0]?.value ?? 0;
    const effectTypeValue = selectedEffectTypeValue ?? fallbackEffectTypeValue;
    const animationName = parsedLabel.animationName || (parsedLabel.effectTypeLabel ? "" : "Normal");
    const composedLabel = composeEffectAnimationLabel(effectTypeValue, animationName);

    return `
        <section class="effect-animation-option-row ${effectAnimationOptionsState.flashIndex === index ? "is-flashing" : ""}" data-effect-animation-index="${index}">
            <span class="effect-animation-option-badge">#${escapeHtml(option.value)}</span>
            <select class="effect-animation-option-select" data-effect-animation-path="options.${index}.effectType">
                ${effectAnimationOptionsState.effectTypes
                    .map((effectType) => `
                        <option value="${escapeHtml(effectType.value)}" ${Number(effectType.value) === Number(effectTypeValue) ? "selected" : ""}>
                            ${escapeHtml(effectType.label)}
                        </option>
                    `)
                    .join("")}
            </select>
            <input
                class="effect-animation-option-input"
                type="text"
                data-effect-animation-path="options.${index}.animationName"
                value="${escapeHtml(animationName)}"
                placeholder="Normal"
            >
            <code class="effect-animation-option-label-preview">${escapeHtml(composedLabel)}</code>
            <div class="effect-animation-option-actions">
                <button
                    class="effect-animation-option-move"
                    type="button"
                    data-effect-animation-move-up="${index}"
                    title="上移"
                    aria-label="上移"
                    ${index === 0 ? "disabled" : ""}
                >
                    ↑
                </button>
                <button
                    class="effect-animation-option-move"
                    type="button"
                    data-effect-animation-move-down="${index}"
                    title="下移"
                    aria-label="下移"
                    ${index === effectAnimationOptionsState.document.options.length - 1 ? "disabled" : ""}
                >
                    ↓
                </button>
                <button
                    class="effect-animation-option-delete"
                    type="button"
                    data-effect-animation-delete="${index}"
                    title="删除这条动画"
                    aria-label="删除这条动画"
                >
                    &times;
                </button>
            </div>
        </section>
    `;
}

function renderEffectAnimationOptionsEditor() {
    const options = Array.isArray(effectAnimationOptionsState.document?.options)
        ? effectAnimationOptionsState.document.options
        : [];

    if (!options.length) {
        effectAnimationOptionsElements.structuredEditor.innerHTML = `
            <div class="empty-state">
                <strong>当前还没有动画选项</strong>
                ${renderEffectAnimationInsertGap(0, true)}
            </div>
        `;
        updateEffectAnimationOptionsPreview();
        return;
    }

    effectAnimationOptionsElements.structuredEditor.innerHTML = `
        <section class="builder-card-block effect-animation-options-panel">
            <div class="panel-header point-cards-chart-header">
                <div>
                    <p class="panel-kicker">Animation Options</p>
                    <h2>EffectType + 动画后缀</h2>
                </div>
                <div class="point-cards-chart-scale">保存时会写成 EffectType_动画名</div>
            </div>
            <div class="effect-animation-options-head">
                <span>Value</span>
                <span>Effect Type</span>
                <span>Animation</span>
                <span>最终名字</span>
                <span></span>
            </div>
            <div class="effect-animation-options-grid">
                ${options
                    .map((option, index) => `
                        ${renderEffectAnimationOptionRow(option, index)}
                        ${renderEffectAnimationInsertGap(index + 1)}
                    `)
                    .join("")}
            </div>
        </section>
    `;

    updateEffectAnimationOptionsPreview();
}

function applyEffectAnimationOptionsDocument(response) {
    effectAnimationOptionsState.localPath = response.localPath || effectAnimationOptionsState.localPath;

    if (response.document !== undefined) {
        effectAnimationOptionsState.document = cloneValue(response.document);
    } else if (response.options !== undefined) {
        effectAnimationOptionsState.document = { options: cloneValue(response.options) };
    }

    if (Array.isArray(response.effectTypes)) {
        effectAnimationOptionsState.effectTypes = cloneValue(response.effectTypes);
    }

    effectAnimationOptionsElements.localPath.textContent = effectAnimationOptionsState.localPath;
    renderEffectAnimationOptionsEditor();
}

function readCurrentEffectAnimationOptionsDocument() {
    return cloneValue(effectAnimationOptionsState.document);
}

function updateEffectAnimationOptionAtIndex(index, changes) {
    const option = effectAnimationOptionsState.document?.options?.[index];
    if (!option) {
        return;
    }

    const currentParts = splitEffectAnimationLabel(option.label);
    const nextEffectTypeValue =
        changes.effectTypeValue
        ?? getEffectTypeValueFromLabel(currentParts.effectTypeLabel)
        ?? effectAnimationOptionsState.effectTypes[0]?.value
        ?? 0;
    const nextAnimationName = changes.animationName ?? currentParts.animationName ?? "";

    effectAnimationOptionsState.document.options[index] = {
        value: Number(option.value),
        label: composeEffectAnimationLabel(nextEffectTypeValue, nextAnimationName),
    };
}

function insertEffectAnimationOption(index) {
    const defaultEffectTypeValue = effectAnimationOptionsState.effectTypes[0]?.value ?? 0;
    const nextOption = {
        value: 0,
        label: composeEffectAnimationLabel(defaultEffectTypeValue, "Normal"),
    };

    if (!Array.isArray(effectAnimationOptionsState.document.options)) {
        effectAnimationOptionsState.document.options = [];
    }

    effectAnimationOptionsState.document.options.splice(index, 0, nextOption);
    renumberEffectAnimationOptions();
    flashEffectAnimationOption(index);
    renderEffectAnimationOptionsEditor();
}

function moveEffectAnimationOption(fromIndex, direction) {
    const options = effectAnimationOptionsState.document?.options;
    if (!Array.isArray(options)) {
        return;
    }

    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= options.length) {
        return;
    }

    const [movedOption] = options.splice(fromIndex, 1);
    options.splice(toIndex, 0, movedOption);
    renumberEffectAnimationOptions();
    flashEffectAnimationOption(toIndex);
    renderEffectAnimationOptionsEditor();
}

function flashEffectAnimationOption(index) {
    effectAnimationOptionsState.flashIndex = index;
    if (effectAnimationOptionsState.flashTimer) {
        clearTimeout(effectAnimationOptionsState.flashTimer);
    }

    effectAnimationOptionsState.flashTimer = window.setTimeout(() => {
        effectAnimationOptionsState.flashTimer = null;
        effectAnimationOptionsState.flashIndex = null;
        const rowNode = effectAnimationOptionsElements.structuredEditor.querySelector(
            `[data-effect-animation-index="${index}"]`,
        );
        if (rowNode) {
            rowNode.classList.remove("is-flashing");
        }
    }, 1200);
}

function updateEffectAnimationOptionRowPreview(index) {
    const option = effectAnimationOptionsState.document?.options?.[index];
    const previewNode = effectAnimationOptionsElements.structuredEditor.querySelector(
        `[data-effect-animation-index="${index}"] .effect-animation-option-label-preview`,
    );

    if (!option || !previewNode) {
        updateEffectAnimationOptionsPreview();
        return;
    }

    previewNode.textContent = option.label;
    updateEffectAnimationOptionsPreview();
}

async function loadLocalEffectAnimationOptions() {
    setStatus(effectAnimationOptionsElements.status, "正在读取本地 EffectAnimationOptions.json ...");

    try {
        const response = await requestJson("/api/effect-animation-options");
        applyEffectAnimationOptionsDocument(response);
        setStatus(effectAnimationOptionsElements.status, "本地 EffectAnimationOptions.json 已载入");
    } catch (error) {
        setStatus(effectAnimationOptionsElements.status, error.message, true);
    }
}

async function saveLocalEffectAnimationOptions() {
    setStatus(effectAnimationOptionsElements.status, "正在保存本地 EffectAnimationOptions.json ...");

    try {
        renumberEffectAnimationOptions();
        const response = await requestJson("/api/effect-animation-options", {
            method: "POST",
            body: JSON.stringify({ document: readCurrentEffectAnimationOptionsDocument() }),
        });
        applyEffectAnimationOptionsDocument(response);
        setStatus(effectAnimationOptionsElements.status, "本地 EffectAnimationOptions.json 已保存");
    } catch (error) {
        setStatus(effectAnimationOptionsElements.status, error.message, true);
    }
}

function scheduleEffectAnimationOptionsSave(delay = 360) {
    if (effectAnimationOptionsState.autosaveTimer) {
        clearTimeout(effectAnimationOptionsState.autosaveTimer);
    }

    setStatus(effectAnimationOptionsElements.status, "已修改，正在等待自动保存...");
    effectAnimationOptionsState.autosaveTimer = window.setTimeout(() => {
        effectAnimationOptionsState.autosaveTimer = null;
        saveLocalEffectAnimationOptions();
    }, delay);
}

async function loadLocalPointCards() {
    setStatus(pointCardsElements.status, "正在读取本地 PointCards.json ...");

    try {
        const response = await requestJson("/api/point-cards");
        applyPointCardsDocument(response);
        setStatus(pointCardsElements.status, "本地 PointCards.json 已载入");
    } catch (error) {
        setStatus(pointCardsElements.status, error.message, true);
    }
}

async function saveLocalPointCards() {
    setStatus(pointCardsElements.status, "正在保存本地 PointCards.json ...");

    try {
        const response = await requestJson("/api/point-cards", {
            method: "POST",
            body: JSON.stringify({ document: readCurrentPointCardsDocument() }),
        });
        applyPointCardsDocument(response);
        setStatus(pointCardsElements.status, "本地 PointCards.json 已保存");
    } catch (error) {
        setStatus(pointCardsElements.status, error.message, true);
    }
}

async function uploadPointCardsToServer() {
    setStatus(pointCardsElements.status, "正在上传 PointCards.json 到游戏服务器 ...");

    try {
        const response = await requestJson("/api/point-cards/upload-game-server", {
            method: "POST",
            body: JSON.stringify({ document: readCurrentPointCardsDocument() }),
        });
        applyPointCardsDocument(response);
        setStatus(pointCardsElements.status, `已上传到游戏服务器: ${response.targetPath}`);
    } catch (error) {
        setStatus(pointCardsElements.status, error.message, true);
    }
}

async function fetchPointCardsFromServer() {
    setStatus(pointCardsElements.status, "正在从游戏服务器获取 PointCards.json ...");

    try {
        const response = await requestJson("/api/point-cards/fetch-game-server", {
            method: "POST",
        });
        applyPointCardsDocument(response);
        setStatus(pointCardsElements.status, `已从游戏服务器获取: ${response.targetPath}`);
    } catch (error) {
        setStatus(pointCardsElements.status, error.message, true);
    }
}

gameConfigElements.structuredEditor.addEventListener("input", (event) => {
    const path = event.target.dataset.configPath;
    const type = event.target.dataset.configType;

    if (!path || !type) {
        return;
    }

    try {
        if (type === "number") {
            const numericValue = Number(event.target.value);
            if (event.target.value === "" || Number.isNaN(numericValue)) {
                return;
            }
            setByPath(gameConfigState.config, path, numericValue);
        } else if (type === "string") {
            setByPath(gameConfigState.config, path, event.target.value);
        } else if (type === "json") {
            setByPath(gameConfigState.config, path, JSON.parse(event.target.value || "null"));
        }

        updateGameConfigPreview();
    } catch (error) {
        setStatus(gameConfigElements.status, error.message, true);
    }
});

gameConfigElements.structuredEditor.addEventListener("change", (event) => {
    const path = event.target.dataset.configPath;
    const type = event.target.dataset.configType;

    if (!path || !type) {
        return;
    }

    try {
        if (type === "boolean") {
            setByPath(gameConfigState.config, path, Boolean(event.target.checked));
        } else if (type === "number") {
            const numericValue = Number(event.target.value);
            if (Number.isNaN(numericValue)) {
                throw new Error(`${humanizeKey(path.split(".").slice(-1)[0])} 必须是数字。`);
            }
            setByPath(gameConfigState.config, path, numericValue);
        } else if (type === "json") {
            setByPath(gameConfigState.config, path, JSON.parse(event.target.value || "null"));
        } else {
            setByPath(gameConfigState.config, path, event.target.value);
        }

        updateGameConfigPreview();
    } catch (error) {
        setStatus(gameConfigElements.status, error.message, true);
        renderGameConfigEditor();
    }
});

pointCardsElements.structuredEditor.addEventListener("input", (event) => {
    const path = event.target.dataset.pointCardPath;
    const type = event.target.dataset.pointCardType;

    if (!path || !type) {
        return;
    }

    try {
        if (type === "number") {
            const numericValue = Number(event.target.value);
            if (event.target.value === "" || Number.isNaN(numericValue)) {
                return;
            }
            setByPath(pointCardsState.document, path, numericValue);
            const cardIndex = extractPointCardIndex(path);
            if (cardIndex !== null) {
                updatePointCardCountDisplay(cardIndex, numericValue);
            }
        }

        updatePointCardsPreview();
    } catch (error) {
        setStatus(pointCardsElements.status, error.message, true);
    }
});

pointCardsElements.structuredEditor.addEventListener("change", (event) => {
    const path = event.target.dataset.pointCardPath;
    const type = event.target.dataset.pointCardType;

    if (!path || !type) {
        return;
    }

    try {
        if (type === "number") {
            const numericValue = Number(event.target.value);
            if (Number.isNaN(numericValue)) {
                throw new Error(`${humanizeKey(path.split(".").slice(-1)[0])} 必须是数字。`);
            }
            setByPath(pointCardsState.document, path, numericValue);
            const cardIndex = extractPointCardIndex(path);
            if (cardIndex !== null) {
                updatePointCardCountDisplay(cardIndex, numericValue);
            }
        }

        updatePointCardsPreview();
    } catch (error) {
        setStatus(pointCardsElements.status, error.message, true);
        renderPointCardsEditor();
    }
});

effectAnimationOptionsElements.structuredEditor.addEventListener("input", (event) => {
    const animationPath = event.target.dataset.effectAnimationPath;

    if (!animationPath) {
        return;
    }

    const index = Number(animationPath.split(".")[1]);
    if (!Number.isInteger(index)) {
        return;
    }

    if (animationPath.endsWith(".animationName")) {
        updateEffectAnimationOptionAtIndex(index, { animationName: event.target.value });
        updateEffectAnimationOptionRowPreview(index);
        scheduleEffectAnimationOptionsSave();
    }
});

effectAnimationOptionsElements.structuredEditor.addEventListener("change", (event) => {
    const animationPath = event.target.dataset.effectAnimationPath;

    if (!animationPath) {
        return;
    }

    const index = Number(animationPath.split(".")[1]);
    if (!Number.isInteger(index)) {
        return;
    }

    if (animationPath.endsWith(".effectType")) {
        updateEffectAnimationOptionAtIndex(index, { effectTypeValue: Number(event.target.value) });
        updateEffectAnimationOptionRowPreview(index);
        scheduleEffectAnimationOptionsSave();
    }
});

effectAnimationOptionsElements.structuredEditor.addEventListener("click", (event) => {
    const insertIndex = event.target.closest("[data-effect-animation-insert]")?.dataset.effectAnimationInsert;
    if (insertIndex !== undefined) {
        insertEffectAnimationOption(Number(insertIndex));
        scheduleEffectAnimationOptionsSave(120);
        return;
    }

    const moveUpIndex = event.target.closest("[data-effect-animation-move-up]")?.dataset.effectAnimationMoveUp;
    if (moveUpIndex !== undefined) {
        moveEffectAnimationOption(Number(moveUpIndex), -1);
        scheduleEffectAnimationOptionsSave(120);
        return;
    }

    const moveDownIndex = event.target.closest("[data-effect-animation-move-down]")?.dataset.effectAnimationMoveDown;
    if (moveDownIndex !== undefined) {
        moveEffectAnimationOption(Number(moveDownIndex), 1);
        scheduleEffectAnimationOptionsSave(120);
        return;
    }

    const deleteIndex = event.target.closest("[data-effect-animation-delete]")?.dataset.effectAnimationDelete;
    if (deleteIndex === undefined) {
        return;
    }

    const option = effectAnimationOptionsState.document?.options?.[Number(deleteIndex)];
    if (!option) {
        return;
    }

    const confirmed = window.confirm(`确认删除动画选项 ${option.label} 吗？`);
    if (!confirmed) {
        return;
    }

    effectAnimationOptionsState.document.options.splice(Number(deleteIndex), 1);
    renumberEffectAnimationOptions();
    renderEffectAnimationOptionsEditor();
    scheduleEffectAnimationOptionsSave(120);
});

gameConfigElements.reloadButton.addEventListener("click", () => {
    loadLocalGameConfig();
});

gameConfigElements.saveButton.addEventListener("click", () => {
    saveLocalGameConfig();
});

gameConfigElements.fetchServerButton.addEventListener("click", () => {
    fetchGameConfigFromServer();
});

gameConfigElements.uploadServerButton.addEventListener("click", () => {
    uploadGameConfigToServer();
});

pointCardsElements.reloadButton.addEventListener("click", () => {
    loadLocalPointCards();
});

pointCardsElements.saveButton.addEventListener("click", () => {
    saveLocalPointCards();
});

pointCardsElements.fetchServerButton.addEventListener("click", () => {
    fetchPointCardsFromServer();
});

pointCardsElements.uploadServerButton.addEventListener("click", () => {
    uploadPointCardsToServer();
});

loadLocalGameConfig();
loadLocalPointCards();
loadLocalEffectAnimationOptions();

document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !effectAnimationOptionsState.autosaveTimer) {
        loadLocalEffectAnimationOptions();
    }
});
