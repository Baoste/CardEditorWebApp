import json
import os
from io import BytesIO
from pathlib import Path

from flask import Blueprint, jsonify, render_template, request, send_file

main_bp = Blueprint("main", __name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
CARDS_DIR = DATA_DIR / "cards"
DECK_FILE = DATA_DIR / "SkillCardDeck.json"
GAME_SERVER_DECK_PATH = os.environ.get(
    "CARD_GAME_SERVER_SKILL_CARDS_FILE",
    "/home/ubuntu//CardGameForLinux/CardGameServer_Data/StreamingAssets/SkillCardsT.json",
)


def ensure_data_files():
    CARDS_DIR.mkdir(parents=True, exist_ok=True)
    DECK_FILE.parent.mkdir(parents=True, exist_ok=True)

    if not DECK_FILE.exists():
        write_json_file(DECK_FILE, {"cards": []})


def read_json_file(path: Path):
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_json_file(path: Path, payload):
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.write("\n")


def dump_json_text(payload):
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def build_deck_document(cards):
    return {"cards": cards}


def write_deck_file(path: Path, cards):
    write_json_file(path, build_deck_document(cards))


def load_deck():
    ensure_data_files()
    deck_document = read_json_file(DECK_FILE)

    if isinstance(deck_document, list):
        return deck_document

    if isinstance(deck_document, dict) and isinstance(deck_document.get("cards"), list):
        return deck_document["cards"]

    raise ValueError('SkillCardDeck.json must contain {"cards": [...]}')


def build_card_descriptor(path: Path):
    card = read_json_file(path)
    card_core = card.get("card") if isinstance(card, dict) else None
    if not isinstance(card_core, dict):
        card_core = card
    display_name = None

    if isinstance(card_core, dict):
        display_name = (
            card_core.get("name")
            or card_core.get("title")
            or card_core.get("cardName")
            or card_core.get("CardName")
        )

    return {
        "id": path.stem,
        "fileName": path.name,
        "name": display_name or path.stem,
        "card": card,
    }


def load_cards():
    ensure_data_files()
    cards = []

    for path in sorted(CARDS_DIR.glob("card_*.json")):
        cards.append(build_card_descriptor(path))

    return cards


def get_card_by_filename(file_name: str):
    path = (CARDS_DIR / file_name).resolve()
    cards_root = CARDS_DIR.resolve()

    if (
        path.parent != cards_root
        or not path.exists()
        or path.suffix.lower() != ".json"
        or not path.name.startswith("card_")
    ):
        return None

    return build_card_descriptor(path)


@main_bp.route("/")
def index():
    return render_template("index.html")


@main_bp.get("/api/cards")
def get_cards():
    try:
        return jsonify({"cards": load_cards()})
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error)}), 500


@main_bp.get("/api/deck")
def get_deck():
    try:
        return jsonify({"deck": load_deck()})
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error)}), 500


@main_bp.post("/api/deck/cards")
def add_card_to_deck():
    payload = request.get_json(silent=True) or {}
    file_name = payload.get("fileName")

    if not file_name:
        return jsonify({"error": "fileName is required."}), 400

    try:
        selected_card = get_card_by_filename(file_name)
        if selected_card is None:
            return jsonify({"error": f"Card file not found: {file_name}"}), 404

        deck = load_deck()
        deck.append(selected_card["card"])
        write_deck_file(DECK_FILE, deck)

        return jsonify({"deck": deck, "addedCard": selected_card["card"]})
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error)}), 500


@main_bp.delete("/api/deck/cards/<int:card_index>")
def remove_card_from_deck(card_index: int):
    try:
        deck = load_deck()

        if card_index < 0 or card_index >= len(deck):
            return jsonify({"error": "Deck index out of range."}), 404

        removed_card = deck.pop(card_index)
        write_deck_file(DECK_FILE, deck)

        return jsonify({"deck": deck, "removedCard": removed_card})
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error)}), 500


@main_bp.post("/api/deck/reorder")
def reorder_deck():
    payload = request.get_json(silent=True) or {}
    from_index = payload.get("fromIndex")
    to_index = payload.get("toIndex")

    if not isinstance(from_index, int) or not isinstance(to_index, int):
        return jsonify({"error": "fromIndex and toIndex must be integers."}), 400

    try:
        deck = load_deck()

        if from_index < 0 or from_index >= len(deck):
            return jsonify({"error": "fromIndex is out of range."}), 404

        bounded_target = max(0, min(to_index, len(deck) - 1))
        card = deck.pop(from_index)
        deck.insert(bounded_target, card)
        write_deck_file(DECK_FILE, deck)

        return jsonify({"deck": deck})
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error)}), 500


@main_bp.post("/api/deck/import-game-server")
def import_deck_to_game_server():
    try:
        deck = load_deck()
        target_path = Path(GAME_SERVER_DECK_PATH)

        if not target_path.parent.exists():
            return jsonify(
                {
                    "error": f"Game server path does not exist: {target_path.parent}",
                    "targetPath": GAME_SERVER_DECK_PATH,
                }
            ), 500

        write_deck_file(target_path, deck)
        return jsonify(
            {
                "message": "Deck imported to game server.",
                "targetPath": GAME_SERVER_DECK_PATH,
            }
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error), "targetPath": GAME_SERVER_DECK_PATH}), 500


@main_bp.get("/api/deck/download")
def download_deck():
    try:
        deck = load_deck()
        buffer = BytesIO(dump_json_text(build_deck_document(deck)).encode("utf-8"))
        buffer.seek(0)

        return send_file(
            buffer,
            as_attachment=True,
            download_name="SkillCardsT.json",
            mimetype="application/json",
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error)}), 500
