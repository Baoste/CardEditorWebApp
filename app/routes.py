import json
import os
import subprocess
from copy import deepcopy
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
    "/home/ubuntu/CardGameForLinux/CardGameServer_Data/StreamingAssets/SkillCardsT.json",
)
RESTART_SCRIPT_PATH = os.environ.get(
    "CARD_GAME_RESTART_SCRIPT",
    "/home/ubuntu/restart_server.sh",
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
    return {"cards": normalize_deck_cards(cards)}


def write_deck_file(path: Path, cards):
    write_json_file(path, build_deck_document(cards))


def extract_card_core(card):
    if isinstance(card, dict) and isinstance(card.get("card"), dict):
        return deepcopy(card["card"])

    if isinstance(card, dict):
        return deepcopy(card)

    raise ValueError("Card data must be a JSON object.")


def normalize_deck_cards(cards):
    return [extract_card_core(card) for card in cards]


def load_deck():
    ensure_data_files()
    deck_document = read_json_file(DECK_FILE)

    if isinstance(deck_document, list):
        return normalize_deck_cards(deck_document)

    if isinstance(deck_document, dict) and isinstance(deck_document.get("cards"), list):
        return normalize_deck_cards(deck_document["cards"])

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


def resolve_card_path(file_name: str, must_exist: bool = True):
    path = (CARDS_DIR / file_name).resolve()
    cards_root = CARDS_DIR.resolve()

    if (
        path.parent != cards_root
        or path.suffix.lower() != ".json"
        or not path.name.startswith("card_")
        or (must_exist and not path.exists())
    ):
        return None

    return path


def build_card_file_name_from_document(document):
    card_core = extract_card_core(document)
    card_id = card_core.get("id")

    if card_id is None:
        raise ValueError("Card document must contain card.id.")

    try:
        normalized_id = int(card_id)
    except (TypeError, ValueError) as error:
        raise ValueError("card.id must be an integer.") from error

    return f"card_{normalized_id}.json"


def get_card_by_filename(file_name: str):
    path = resolve_card_path(file_name, must_exist=True)
    if path is None:
        return None

    return build_card_descriptor(path)


def normalize_card_editor_payload(payload):
    required_fields = ("id", "name", "description", "point", "type", "count")
    normalized = {}

    for field_name in required_fields:
        if field_name not in payload:
            raise ValueError(f"{field_name} is required.")

    try:
        normalized["id"] = int(payload["id"])
        normalized["point"] = int(payload["point"])
        normalized["type"] = int(payload["type"])
        normalized["count"] = int(payload["count"])
    except (TypeError, ValueError) as error:
        raise ValueError("id, point, type, and count must be integers.") from error

    if normalized["type"] not in (0, 1):
        raise ValueError("type must be 0 or 1.")

    normalized["name"] = str(payload["name"]).strip()
    normalized["description"] = str(payload["description"]).strip()

    if not normalized["name"]:
        raise ValueError("name cannot be empty.")

    return normalized


@main_bp.route("/")
def index():
    return render_template("index.html")


@main_bp.route("/card-builder")
def card_builder():
    return render_template("card_builder.html")


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


@main_bp.get("/api/card-file")
def get_card_file():
    file_name = request.args.get("fileName", "")
    path = resolve_card_path(file_name, must_exist=True)

    if path is None or not path.exists():
        return jsonify({"error": f"Card file not found: {file_name}"}), 404

    try:
        return jsonify(
            {
                "fileName": path.name,
                "document": read_json_file(path),
            }
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error)}), 500


@main_bp.delete("/api/card-file")
def delete_card_file():
    file_name = request.args.get("fileName", "")
    path = resolve_card_path(file_name, must_exist=True)

    if path is None or not path.exists():
        return jsonify({"error": f"Card file not found: {file_name}"}), 404

    try:
        path.unlink()
        return jsonify({"deletedFileName": file_name})
    except OSError as error:
        return jsonify({"error": str(error)}), 500


@main_bp.post("/api/card-file/save")
def save_card_file():
    payload = request.get_json(silent=True) or {}
    current_file_name = str(payload.get("currentFileName", "")).strip()
    document = payload.get("document")

    if not isinstance(document, dict):
        return jsonify({"error": "document must be a JSON object."}), 400

    try:
        target_file_name = build_card_file_name_from_document(document)
        target_path = resolve_card_path(target_file_name, must_exist=False)
        if target_path is None:
            return jsonify({"error": "Unable to resolve target card file path."}), 400

        current_path = None
        if current_file_name:
            current_path = resolve_card_path(current_file_name, must_exist=True)
            if current_path is None:
                return jsonify({"error": f"Card file not found: {current_file_name}"}), 404

        if current_path is None and target_path.exists():
            return jsonify({"error": f"Target card file already exists: {target_file_name}"}), 409

        if (
            current_path is not None
            and current_path != target_path
            and target_path.exists()
        ):
            return jsonify({"error": f"Target card file already exists: {target_file_name}"}), 409

        write_json_file(target_path, document)

        if current_path is not None and current_path != target_path and current_path.exists():
            current_path.unlink()

        return jsonify({"card": build_card_descriptor(target_path)})
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error)}), 500


@main_bp.post("/api/server/restart")
def restart_server():
    script_path = Path(RESTART_SCRIPT_PATH)

    if not script_path.exists():
        return jsonify(
            {
                "error": f"Restart script not found: {RESTART_SCRIPT_PATH}",
                "scriptPath": RESTART_SCRIPT_PATH,
            }
        ), 500

    try:
        completed = subprocess.run(
            ["/bin/bash", str(script_path)],
            capture_output=True,
            text=True,
            check=True,
            timeout=180,
        )
        return jsonify(
            {
                "message": "Server restart command completed.",
                "scriptPath": RESTART_SCRIPT_PATH,
                "stdout": completed.stdout.strip(),
                "stderr": completed.stderr.strip(),
            }
        )
    except subprocess.CalledProcessError as error:
        return jsonify(
            {
                "error": error.stderr.strip() or error.stdout.strip() or str(error),
                "scriptPath": RESTART_SCRIPT_PATH,
            }
        ), 500
    except (OSError, subprocess.SubprocessError) as error:
        return jsonify({"error": str(error), "scriptPath": RESTART_SCRIPT_PATH}), 500


@main_bp.post("/api/cards/update")
def update_card():
    payload = request.get_json(silent=True) or {}
    file_name = payload.get("fileName")

    if not file_name:
        return jsonify({"error": "fileName is required."}), 400

    selected_card = get_card_by_filename(file_name)
    if selected_card is None:
        return jsonify({"error": f"Card file not found: {file_name}"}), 404

    try:
        normalized = normalize_card_editor_payload(payload)
        card_path = CARDS_DIR / file_name
        card_document = read_json_file(card_path)

        if isinstance(card_document, dict) and isinstance(card_document.get("card"), dict):
            editable_card = card_document["card"]
        elif isinstance(card_document, dict):
            editable_card = card_document
        else:
            return jsonify({"error": "Card JSON must be an object."}), 400

        for key, value in normalized.items():
            editable_card[key] = value

        write_json_file(card_path, card_document)
        return jsonify({"card": build_card_descriptor(card_path)})
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
        deck.append(extract_card_core(selected_card["card"]))
        write_deck_file(DECK_FILE, deck)

        return jsonify({"deck": deck, "addedCard": deck[-1]})
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
