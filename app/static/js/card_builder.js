const builderState = {
    cards: [],
    filterText: "",
    selectedFileName: "",
};

const builderElements = {
    cardList: document.getElementById("builder-card-list"),
    search: document.getElementById("builder-search"),
    reloadButton: document.getElementById("builder-reload-button"),
    title: document.getElementById("builder-title"),
    status: document.getElementById("builder-status"),
    fileName: document.getElementById("builder-file-name"),
    jsonEditor: document.getElementById("builder-json-editor"),
    newButton: document.getElementById("builder-new-button"),
    formatButton: document.getElementById("builder-format-button"),
    saveButton: document.getElementById("builder-save-button"),
};

const emptyCardTemplate = {
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

function builderSetStatus(message, isError = false) {
    builderElements.status.textContent = message;
    builderElements.status.style.background = isError
        ? "rgba(176, 58, 46, 0.12)"
        : "rgba(44, 122, 88, 0.12)";
    builderElements.status.style.color = isError ? "#a13329" : "#2c7a58";
}

function builderEscapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function getBuilderCardCore(card) {
    if (card && typeof card === "object" && !Array.isArray(card) && card.card && typeof card.card === "object") {
        return card.card;
    }

    return card;
}

function builderFormatJson(value) {
    return JSON.stringify(value, null, 2);
}

function getGeneratedFileNameFromDocument(document) {
    const coreCard = getBuilderCardCore(document);

    if (!coreCard || typeof coreCard !== "object" || Array.isArray(coreCard)) {
        throw new Error("卡牌 JSON 必须是对象，且包含 card.id");
    }

    const cardId = Number(coreCard.id);
    if (!Number.isInteger(cardId)) {
        throw new Error("card.id 必须是整数");
    }

    return `card_${cardId}.json`;
}

function syncBuilderFileNameFromEditor() {
    try {
        const parsed = JSON.parse(builderElements.jsonEditor.value || "{}");
        const fileName = getGeneratedFileNameFromDocument(parsed);
        builderElements.fileName.value = fileName;
        return fileName;
    } catch {
        builderElements.fileName.value = "";
        return "";
    }
}

async function builderRequestJson(url, options = {}) {
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

function renderBuilderCardList() {
    const keyword = builderState.filterText.trim().toLowerCase();
    const filteredCards = builderState.cards.filter((item) => {
        if (!keyword) {
            return true;
        }

        const coreCard = getBuilderCardCore(item.card);
        const haystack = [
            item.fileName,
            item.name,
            coreCard?.description || "",
        ].join(" ").toLowerCase();

        return haystack.includes(keyword);
    });

    if (!filteredCards.length) {
        builderElements.cardList.innerHTML = `
            <div class="empty-state">
                <strong>没有匹配到卡牌文件</strong>
                <div>可以新建一张卡，或调整搜索词。</div>
            </div>
        `;
        return;
    }

    builderElements.cardList.innerHTML = filteredCards
        .map((item) => {
            const coreCard = getBuilderCardCore(item.card) || {};
            const isSelected = builderState.selectedFileName === item.fileName;
            return `
                <article class="card-tile ${isSelected ? "is-selected" : ""}" data-file-name="${item.fileName}">
                    <div class="card-tile-header">
                        <div>
                            <h3 class="card-title">${builderEscapeHtml(item.name)}</h3>
                            <div class="card-file">${builderEscapeHtml(item.fileName)}</div>
                        </div>
                        <button class="ghost-button builder-delete-button" type="button" data-file-name="${item.fileName}">
                            删除
                        </button>
                    </div>
                    <div class="card-summary">
                        ${builderEscapeHtml(`id: ${coreCard.id ?? "-"} | type: ${coreCard.type ?? "-"} | point: ${coreCard.point ?? "-"}`)}
                    </div>
                </article>
            `;
        })
        .join("");

    builderElements.cardList.querySelectorAll(".card-tile").forEach((node) => {
        node.addEventListener("click", () => {
            loadCardFile(node.dataset.fileName);
        });
    });

    builderElements.cardList.querySelectorAll(".builder-delete-button").forEach((button) => {
        button.addEventListener("click", async (event) => {
            event.stopPropagation();
            await deleteCardFile(button.dataset.fileName);
        });
    });
}

async function loadBuilderCards() {
    builderSetStatus("正在读取卡牌文件...");

    try {
        const response = await builderRequestJson("/api/cards");
        builderState.cards = response.cards;
        renderBuilderCardList();
        builderSetStatus("卡牌文件已加载");
    } catch (error) {
        builderSetStatus(error.message, true);
    }
}

async function loadCardFile(fileName) {
    builderSetStatus(`正在读取 ${fileName} ...`);

    try {
        const response = await builderRequestJson(`/api/card-file?fileName=${encodeURIComponent(fileName)}`);
        builderState.selectedFileName = response.fileName;
        builderElements.fileName.value = response.fileName;
        builderElements.title.textContent = response.fileName;
        builderElements.jsonEditor.value = builderFormatJson(response.document);
        syncBuilderFileNameFromEditor();
        renderBuilderCardList();
        builderSetStatus(`${response.fileName} 已载入`);
    } catch (error) {
        builderSetStatus(error.message, true);
    }
}

function createNewCard() {
    builderState.selectedFileName = "";
    builderElements.fileName.value = "card_0.json";
    builderElements.title.textContent = "新建卡牌";
    builderElements.jsonEditor.value = builderFormatJson(emptyCardTemplate);
    syncBuilderFileNameFromEditor();
    renderBuilderCardList();
    builderSetStatus("已生成空白卡模板，文件名会跟随 id 自动变化");
}

function formatCurrentJson() {
    try {
        const parsed = JSON.parse(builderElements.jsonEditor.value || "{}");
        builderElements.jsonEditor.value = builderFormatJson(parsed);
        syncBuilderFileNameFromEditor();
        builderSetStatus("JSON 已格式化");
    } catch (error) {
        builderSetStatus(`JSON 格式错误: ${error.message}`, true);
    }
}

async function saveCurrentCard() {
    let document;
    let targetFileName;
    try {
        document = JSON.parse(builderElements.jsonEditor.value || "{}");
        targetFileName = getGeneratedFileNameFromDocument(document);
        builderElements.fileName.value = targetFileName;
    } catch (error) {
        builderSetStatus(`JSON 格式错误: ${error.message}`, true);
        return;
    }

    builderSetStatus(`正在保存 ${targetFileName} ...`);

    try {
        const response = await builderRequestJson("/api/card-file/save", {
            method: "POST",
            body: JSON.stringify({
                currentFileName: builderState.selectedFileName,
                document,
            }),
        });

        builderState.selectedFileName = response.card.fileName;
        builderElements.fileName.value = response.card.fileName;
        builderElements.title.textContent = response.card.fileName;
        builderElements.jsonEditor.value = builderFormatJson(response.card.card);
        await loadBuilderCards();
        builderSetStatus(`${response.card.fileName} 已保存到 data/cards`);
    } catch (error) {
        builderSetStatus(error.message, true);
    }
}

async function deleteCardFile(fileName) {
    if (!fileName) {
        builderSetStatus("缺少要删除的文件名", true);
        return;
    }

    const confirmed = window.confirm(`确认删除 ${fileName} 吗？此操作不可撤销。`);
    if (!confirmed) {
        return;
    }

    builderSetStatus(`正在删除 ${fileName} ...`);

    try {
        await builderRequestJson(`/api/card-file?fileName=${encodeURIComponent(fileName)}`, {
            method: "DELETE",
        });

        if (builderState.selectedFileName === fileName) {
            createNewCard();
        }

        await loadBuilderCards();
        builderSetStatus(`${fileName} 已删除`);
    } catch (error) {
        builderSetStatus(error.message, true);
    }
}

builderElements.search.addEventListener("input", (event) => {
    builderState.filterText = event.target.value;
    renderBuilderCardList();
});

builderElements.reloadButton.addEventListener("click", () => {
    loadBuilderCards();
});

builderElements.newButton.addEventListener("click", () => {
    createNewCard();
});

builderElements.formatButton.addEventListener("click", () => {
    formatCurrentJson();
});

builderElements.saveButton.addEventListener("click", () => {
    saveCurrentCard();
});

builderElements.jsonEditor.addEventListener("input", () => {
    syncBuilderFileNameFromEditor();
});

createNewCard();
loadBuilderCards();
