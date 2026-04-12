const state = {
    cards: [],
    deck: [],
    filterText: "",
    draggingCardFile: null,
    draggingDeckIndex: null,
};

const elements = {
    libraryList: document.getElementById("library-list"),
    deckList: document.getElementById("deck-list"),
    deckDropzone: document.getElementById("deck-dropzone"),
    hoverPreview: document.getElementById("hover-preview"),
    jsonPreview: document.getElementById("json-preview"),
    detailTitle: document.getElementById("detail-title"),
    statusMessage: document.getElementById("status-message"),
    allCardCount: document.getElementById("all-card-count"),
    deckCount: document.getElementById("deck-count"),
    importServerButton: document.getElementById("import-server-button"),
    downloadDeckButton: document.getElementById("download-deck-button"),
    reloadButton: document.getElementById("reload-button"),
    cardSearch: document.getElementById("card-search"),
};

function formatJson(value) {
    return JSON.stringify(value, null, 2);
}

function setStatus(message, isError = false) {
    elements.statusMessage.textContent = message;
    elements.statusMessage.style.background = isError
        ? "rgba(176, 58, 46, 0.12)"
        : "rgba(44, 122, 88, 0.12)";
    elements.statusMessage.style.color = isError ? "#a13329" : "#2c7a58";
}

function showJson(title, payload) {
    elements.detailTitle.textContent = title;
    elements.jsonPreview.textContent = formatJson(payload);
}

function getCardCore(card) {
    if (!card || typeof card !== "object" || Array.isArray(card)) {
        return card;
    }

    if (card.card && typeof card.card === "object" && !Array.isArray(card.card)) {
        return card.card;
    }

    return card;
}

function summarizeCard(card) {
    const coreCard = getCardCore(card);

    if (!coreCard || typeof coreCard !== "object" || Array.isArray(coreCard)) {
        return "非对象卡牌数据";
    }

    const priorityKeys = ["id", "point", "type", "count", "cost", "rarity", "attack", "defense", "hp"];
    const segments = priorityKeys
        .filter((key) => Object.prototype.hasOwnProperty.call(coreCard, key))
        .map((key) => `${key}: ${coreCard[key]}`);

    if (!segments.length) {
        return `${Object.keys(coreCard).length} 个字段`;
    }

    return segments.join(" | ");
}

function getCardDisplayName(card, fallback) {
    const coreCard = getCardCore(card);

    if (!coreCard || typeof coreCard !== "object" || Array.isArray(coreCard)) {
        return fallback;
    }

    return coreCard.name || coreCard.title || coreCard.cardName || coreCard.CardName || fallback;
}

function getCardDescription(card) {
    const coreCard = getCardCore(card);

    if (!coreCard || typeof coreCard !== "object" || Array.isArray(coreCard)) {
        return "无可展示的描述";
    }

    return coreCard.description || coreCard.desc || "无描述";
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function formatPreviewValue(value) {
    if (value === undefined || value === null || value === "") {
        return "无";
    }

    if (typeof value === "object") {
        return formatJson(value);
    }

    return String(value);
}

function buildHoverPreviewHtml(item) {
    const coreCard = getCardCore(item.card);
    const effects = Array.isArray(coreCard?.effects) ? coreCard.effects : [];
    const stats = [
        ["ID", coreCard?.id],
        ["点数", coreCard?.point],
        ["类型", coreCard?.type],
        ["数量", coreCard?.count],
    ];

    return `
        <div>
            <h3 class="hover-preview-title">${escapeHtml(getCardDisplayName(item.card, item.name))}</h3>
            <div class="hover-preview-file">${escapeHtml(item.fileName)}</div>
        </div>
        <div class="hover-preview-description">${escapeHtml(getCardDescription(item.card))}</div>
        <div class="hover-preview-grid">
            ${stats.map(([label, value]) => `
                <div class="hover-preview-stat">
                    <span>${escapeHtml(label)}</span>
                    <strong>${escapeHtml(formatPreviewValue(value))}</strong>
                </div>
            `).join("")}
        </div>
        <div class="hover-preview-effects">
            <strong>效果节点</strong> ${effects.length} 个
            <br>
            <span>${escapeHtml(summarizeCard(item.card))}</span>
        </div>
    `;
}

function positionHoverPreview(clientX, clientY) {
    const preview = elements.hoverPreview;
    const gap = 18;
    const width = preview.offsetWidth;
    const height = preview.offsetHeight;
    const maxLeft = window.innerWidth - width - 12;
    const maxTop = window.innerHeight - height - 12;
    const left = Math.max(12, Math.min(clientX + gap, maxLeft));
    const top = Math.max(12, Math.min(clientY + gap, maxTop));

    preview.style.left = `${left}px`;
    preview.style.top = `${top}px`;
}

function showHoverPreview(item, event) {
    if (!elements.hoverPreview) {
        return;
    }

    elements.hoverPreview.innerHTML = buildHoverPreviewHtml(item);
    elements.hoverPreview.classList.remove("is-hidden");
    elements.hoverPreview.setAttribute("aria-hidden", "false");
    positionHoverPreview(event.clientX, event.clientY);
}

function hideHoverPreview() {
    if (!elements.hoverPreview) {
        return;
    }

    elements.hoverPreview.classList.add("is-hidden");
    elements.hoverPreview.setAttribute("aria-hidden", "true");
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

async function loadData() {
    setStatus("正在读取 JSON 数据...");

    try {
        const [cardsResponse, deckResponse] = await Promise.all([
            requestJson("/api/cards"),
            requestJson("/api/deck"),
        ]);

        state.cards = cardsResponse.cards;
        state.deck = deckResponse.deck;

        renderLibrary();
        renderDeck();
        updateCounters();
        setStatus("数据已加载");
    } catch (error) {
        setStatus(error.message, true);
    }
}

function updateCounters() {
    elements.allCardCount.textContent = String(state.cards.length);
    elements.deckCount.textContent = String(state.deck.length);
}

function renderLibrary() {
    const keyword = state.filterText.trim().toLowerCase();
    const filteredCards = state.cards.filter((item) => {
        if (!keyword) {
            return true;
        }

        const haystack = [
            item.name,
            item.fileName,
            formatJson(item.card),
        ].join(" ").toLowerCase();

        return haystack.includes(keyword);
    });

    if (!filteredCards.length) {
        elements.libraryList.innerHTML = `
            <div class="empty-state">
                <strong>没有匹配到卡牌</strong>
                <div>请确认 <code>data/cards/</code> 下存在 <code>card_*.json</code> 文件。</div>
            </div>
        `;
        return;
    }

    elements.libraryList.innerHTML = filteredCards
        .map((item) => `
            <article
                class="card-tile"
                data-file-name="${item.fileName}"
                draggable="true"
            >
                <div class="card-tile-header">
                    <div>
                        <h3 class="card-title">${escapeHtml(item.name)}</h3>
                        <div class="card-file">${escapeHtml(item.fileName)}</div>
                    </div>
                </div>
                <div class="card-summary">${escapeHtml(summarizeCard(item.card))}</div>
            </article>
        `)
        .join("");

    bindLibraryEvents();
}

function renderDeck() {
    if (!state.deck.length) {
        elements.deckList.innerHTML = `
            <div class="empty-state">
                <strong>当前卡组还是空的</strong>
                <div>把左侧卡牌拖进上方区域，系统会自动追加到 <code>SkillCardDeck.json</code>。</div>
            </div>
        `;
        return;
    }

    elements.deckList.innerHTML = state.deck
        .map((card, index) => `
            <article class="deck-card" data-deck-index="${index}" draggable="true">
                <div class="deck-card-body">
                    <div class="deck-card-info">
                        <div class="deck-card-header">
                            <div>
                                <h3 class="card-title">${escapeHtml(getCardDisplayName(card, `卡牌 ${index + 1}`))}</h3>
                                <div class="deck-index">位置 ${index + 1}</div>
                            </div>
                        </div>
                        <div class="deck-summary">${escapeHtml(summarizeCard(card))}</div>
                    </div>
                    <div class="deck-card-actions">
                        <button class="ghost-button" type="button" data-action="preview" data-deck-index="${index}">查看 JSON</button>
                        <button class="ghost-button" type="button" data-action="remove" data-deck-index="${index}">移除</button>
                    </div>
                </div>
            </article>
        `)
        .join("");

    bindDeckEvents();
}

function bindLibraryEvents() {
    elements.libraryList.querySelectorAll(".card-tile").forEach((node) => {
        node.addEventListener("click", () => {
            const card = state.cards.find((item) => item.fileName === node.dataset.fileName);
            if (card) {
                showJson(card.fileName, card.card);
            }
        });

        node.addEventListener("mouseenter", (event) => {
            const card = state.cards.find((item) => item.fileName === node.dataset.fileName);
            if (card) {
                showHoverPreview(card, event);
            }
        });

        node.addEventListener("mousemove", (event) => {
            if (!elements.hoverPreview || elements.hoverPreview.classList.contains("is-hidden")) {
                return;
            }

            positionHoverPreview(event.clientX, event.clientY);
        });

        node.addEventListener("mouseleave", () => {
            hideHoverPreview();
        });

        node.addEventListener("dragstart", () => {
            state.draggingCardFile = node.dataset.fileName;
            state.draggingDeckIndex = null;
            node.classList.add("is-dragging");
            hideHoverPreview();
        });

        node.addEventListener("dragend", () => {
            node.classList.remove("is-dragging");
        });
    });
}

function bindDeckEvents() {
    elements.deckList.querySelectorAll(".deck-card").forEach((node) => {
        node.addEventListener("dragstart", () => {
            state.draggingDeckIndex = Number(node.dataset.deckIndex);
            state.draggingCardFile = null;
            node.classList.add("is-dragging");
        });

        node.addEventListener("dragend", () => {
            node.classList.remove("is-dragging");
            node.classList.remove("is-drop-target");
        });

        node.addEventListener("dragover", (event) => {
            if (state.draggingDeckIndex === null) {
                return;
            }

            event.preventDefault();
            node.classList.add("is-drop-target");
        });

        node.addEventListener("dragleave", () => {
            node.classList.remove("is-drop-target");
        });

        node.addEventListener("drop", async (event) => {
            event.preventDefault();
            node.classList.remove("is-drop-target");

            if (state.draggingDeckIndex === null) {
                return;
            }

            const targetIndex = Number(node.dataset.deckIndex);
            if (Number.isNaN(targetIndex)) {
                return;
            }

            await reorderDeckCard(state.draggingDeckIndex, targetIndex);
        });
    });

    elements.deckList.querySelectorAll("[data-action='preview']").forEach((button) => {
        button.addEventListener("click", () => {
            const index = Number(button.dataset.deckIndex);
            showJson(`Deck #${index + 1}`, state.deck[index]);
        });
    });

    elements.deckList.querySelectorAll("[data-action='remove']").forEach((button) => {
        button.addEventListener("click", async () => {
            const index = Number(button.dataset.deckIndex);
            await removeDeckCard(index);
        });
    });
}

async function appendCardToDeck(fileName) {
    setStatus(`正在添加 ${fileName} ...`);

    try {
        const response = await requestJson("/api/deck/cards", {
            method: "POST",
            body: JSON.stringify({ fileName }),
        });

        state.deck = response.deck;
        renderDeck();
        updateCounters();
        showJson(fileName, response.addedCard);
        setStatus(`${fileName} 已写入 SkillCardDeck.json`);
    } catch (error) {
        setStatus(error.message, true);
    }
}

async function removeDeckCard(index) {
    setStatus(`正在移除第 ${index + 1} 张卡...`);

    try {
        const response = await requestJson(`/api/deck/cards/${index}`, {
            method: "DELETE",
        });

        state.deck = response.deck;
        renderDeck();
        updateCounters();
        showJson(`已移除 #${index + 1}`, response.removedCard);
        setStatus(`已从 SkillCardDeck.json 移除第 ${index + 1} 张卡`);
    } catch (error) {
        setStatus(error.message, true);
    }
}

async function reorderDeckCard(fromIndex, toIndex) {
    if (fromIndex === toIndex) {
        return;
    }

    setStatus(`正在调整卡组顺序：${fromIndex + 1} -> ${toIndex + 1}`);

    try {
        const response = await requestJson("/api/deck/reorder", {
            method: "POST",
            body: JSON.stringify({ fromIndex, toIndex }),
        });

        state.deck = response.deck;
        renderDeck();
        updateCounters();
        setStatus("卡组顺序已更新");
    } catch (error) {
        setStatus(error.message, true);
    }
}

async function importDeckToGameServer() {
    setStatus("正在导入到游戏服务器...");

    try {
        const response = await requestJson("/api/deck/import-game-server", {
            method: "POST",
        });

        setStatus(`已导入到游戏服务器: ${response.targetPath}`);
    } catch (error) {
        setStatus(error.message, true);
    }
}

function downloadDeckFile() {
    setStatus("正在下载 SkillCardsT.json ...");
    window.location.href = "/api/deck/download";
}

function bindGlobalEvents() {
    document.addEventListener("scroll", () => {
        hideHoverPreview();
    }, { passive: true });

    elements.deckDropzone.addEventListener("dragover", (event) => {
        if (!state.draggingCardFile) {
            return;
        }

        event.preventDefault();
        elements.deckDropzone.classList.add("is-over");
    });

    elements.deckDropzone.addEventListener("dragleave", () => {
        elements.deckDropzone.classList.remove("is-over");
    });

    elements.deckDropzone.addEventListener("drop", async (event) => {
        event.preventDefault();
        elements.deckDropzone.classList.remove("is-over");

        if (!state.draggingCardFile) {
            return;
        }

        const fileName = state.draggingCardFile;
        state.draggingCardFile = null;
        await appendCardToDeck(fileName);
    });

    elements.reloadButton.addEventListener("click", () => {
        loadData();
    });

    elements.importServerButton.addEventListener("click", () => {
        importDeckToGameServer();
    });

    elements.downloadDeckButton.addEventListener("click", () => {
        downloadDeckFile();
    });

    elements.cardSearch.addEventListener("input", (event) => {
        state.filterText = event.target.value;
        renderLibrary();
        hideHoverPreview();
    });
}

bindGlobalEvents();
loadData();
