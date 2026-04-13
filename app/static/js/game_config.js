const gameConfigState = {
    localPath: "data/GameConfig.json",
    serverPath: "/home/ubuntu/CardGameForLinux/CardGameServer_Data/StreamingAssets/GameConfig.json",
    config: {},
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

function formatJson(value) {
    return JSON.stringify(value, null, 2);
}

function cloneValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function setStatus(message, isError = false) {
    gameConfigElements.status.textContent = message;
    gameConfigElements.status.style.background = isError
        ? "rgba(176, 58, 46, 0.12)"
        : "rgba(44, 122, 88, 0.12)";
    gameConfigElements.status.style.color = isError ? "#a13329" : "#2c7a58";
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

function humanizeKey(key) {
    return String(key)
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replaceAll("_", " ")
        .trim();
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function getByPath(root, path) {
    return path.split(".").reduce((current, key) => {
        if (current == null) {
            return undefined;
        }
        return current[key];
    }, root);
}

function setByPath(root, path, value) {
    const keys = path.split(".");
    let current = root;

    for (let index = 0; index < keys.length - 1; index += 1) {
        const key = keys[index];
        if (!current[key] || typeof current[key] !== "object" || Array.isArray(current[key])) {
            current[key] = {};
        }
        current = current[key];
    }

    current[keys[keys.length - 1]] = value;
}

function updatePreview() {
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

    if (Array.isArray(value)) {
        return `
            <label class="editor-field editor-field-wide">
                <span>${label}</span>
                <textarea rows="4" data-config-path="${escapeHtml(path)}" data-config-type="json">${escapeHtml(formatJson(value))}</textarea>
            </label>
        `;
    }

    if (value && typeof value === "object") {
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

function renderObjectSection(title, objectValue, pathPrefix = "") {
    const entries = Object.entries(objectValue || {});
    const fields = entries.map(([key, value]) => {
        const nextPath = pathPrefix ? `${pathPrefix}.${key}` : key;

        if (value && typeof value === "object" && !Array.isArray(value)) {
            return `
                <section class="builder-card-block config-section-block">
                    <h3 class="builder-block-title">${escapeHtml(humanizeKey(key))}</h3>
                    <div class="editor-grid config-editor-fields">
                        ${Object.entries(value).map(([childKey, childValue]) => renderLeafField(`${nextPath}.${childKey}`, childKey, childValue)).join("")}
                    </div>
                </section>
            `;
        }

        return renderLeafField(nextPath, key, value);
    }).join("");

    return `
        <section class="builder-card-block">
            <h3 class="builder-block-title">${escapeHtml(title)}</h3>
            <div class="editor-grid config-editor-fields">
                ${fields}
            </div>
        </section>
    `;
}

function renderStructuredEditor() {
    const config = gameConfigState.config;
    const topLevelEntries = Object.entries(config || {});

    if (!topLevelEntries.length) {
        gameConfigElements.structuredEditor.innerHTML = `
            <div class="empty-state">
                <strong>当前没有可编辑配置</strong>
                <div>先从本地读取或从服务器获取一份 GameConfig.json。</div>
            </div>
        `;
        updatePreview();
        return;
    }

    gameConfigElements.structuredEditor.innerHTML = topLevelEntries
        .map(([key, value]) => {
            if (value && typeof value === "object" && !Array.isArray(value)) {
                return renderObjectSection(humanizeKey(key), value, key);
            }

            return renderObjectSection("Game Config", { [key]: value });
        })
        .join("");

    updatePreview();
}

function applyConfigDocument(response) {
    gameConfigState.localPath = response.localPath || gameConfigState.localPath;
    gameConfigState.serverPath = response.targetPath || gameConfigState.serverPath;

    if (response.config !== undefined) {
        gameConfigState.config = cloneValue(response.config);
    }

    gameConfigElements.localPath.textContent = gameConfigState.localPath;
    gameConfigElements.serverPath.textContent = gameConfigState.serverPath;
    renderStructuredEditor();
}

function readCurrentConfig() {
    return cloneValue(gameConfigState.config);
}

async function loadLocalGameConfig() {
    setStatus("正在读取本地 GameConfig.json ...");

    try {
        const response = await requestJson("/api/game-config");
        applyConfigDocument(response);
        setStatus("本地 GameConfig.json 已载入");
    } catch (error) {
        setStatus(error.message, true);
    }
}

async function saveLocalGameConfig() {
    setStatus("正在保存本地 GameConfig.json ...");

    try {
        const response = await requestJson("/api/game-config", {
            method: "POST",
            body: JSON.stringify({ config: readCurrentConfig() }),
        });
        applyConfigDocument(response);
        setStatus("本地 GameConfig.json 已保存");
    } catch (error) {
        setStatus(error.message, true);
    }
}

async function uploadGameConfigToServer() {
    setStatus("正在上传 GameConfig.json 到游戏服务器 ...");

    try {
        const response = await requestJson("/api/game-config/upload-game-server", {
            method: "POST",
            body: JSON.stringify({ config: readCurrentConfig() }),
        });
        applyConfigDocument(response);
        setStatus(`已上传到游戏服务器: ${response.targetPath}`);
    } catch (error) {
        setStatus(error.message, true);
    }
}

async function fetchGameConfigFromServer() {
    setStatus("正在从游戏服务器获取 GameConfig.json ...");

    try {
        const response = await requestJson("/api/game-config/fetch-game-server", {
            method: "POST",
        });
        applyConfigDocument(response);
        setStatus(`已从游戏服务器获取: ${response.targetPath}`);
    } catch (error) {
        setStatus(error.message, true);
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

        updatePreview();
    } catch (error) {
        setStatus(error.message, true);
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

        updatePreview();
    } catch (error) {
        setStatus(error.message, true);
        renderStructuredEditor();
    }
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

loadLocalGameConfig();
