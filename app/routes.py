import json
import os
import re
import subprocess
from copy import deepcopy
from io import BytesIO
from pathlib import Path

from flask import Blueprint, jsonify, render_template, request, send_file

main_bp = Blueprint("main", __name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
CARDS_DIR = DATA_DIR / "cards"
CARD_FLOW_DIR = DATA_DIR / "card_flows"
DECK_FILE = DATA_DIR / "SkillCardDeck.json"
GAME_CONFIG_FILE = DATA_DIR / "GameConfig.json"
POINT_CARDS_FILE = DATA_DIR / "PointCards.json"
EFFECT_ANIMATION_OPTIONS_FILE = DATA_DIR / "EffectAnimationOptions.json"
CARD_COMPLETION_FILE = DATA_DIR / "CardCompletionStatus.json"
CARD_FLOW_FILE_PREFIX = "card_flow_"
GAME_SERVER_DECK_PATH = os.environ.get(
    "CARD_GAME_SERVER_SKILL_CARDS_FILE",
    "/home/ubuntu/CardGameForLinux/CardGameServer_Data/StreamingAssets/SkillCardsT.json",
)
GAME_SERVER_CONFIG_PATH = os.environ.get(
    "CARD_GAME_SERVER_CONFIG_FILE",
    "/home/ubuntu/CardGameForLinux/CardGameServer_Data/StreamingAssets/GameConfig.json",
)
GAME_SERVER_POINT_CARDS_PATH = os.environ.get(
    "CARD_GAME_POINT_CARDS_FILE",
    "/home/ubuntu/CardGameForLinux/CardGameServer_Data/StreamingAssets/PointCards.json",
)
RESTART_SCRIPT_PATH = os.environ.get(
    "CARD_GAME_RESTART_SCRIPT",
    "/home/ubuntu/restart_server.sh",
)


DEFAULT_EFFECT_ANIMATION_OPTIONS = [
    {"value": 0, "label": "DrawPoint_Normal"},
    {"value": 1, "label": "DrawSkill_Normal"},
    {"value": 2, "label": "DrawPointToResolve_Normal"},
    {"value": 3, "label": "Discard_Normal"},
    {"value": 4, "label": "Discard_Lazer"},
    {"value": 5, "label": "ModifyPoint_Normal"},
    {"value": 6, "label": "Move_Normal"},
    {"value": 7, "label": "Judge_Normal"},
    {"value": 8, "label": "AddActionPoint_Normal"},
    {"value": 9, "label": "Peek_Normal"},
    {"value": 10, "label": "ChangeCardState_Normal"},
]

EFFECT_TYPE_LABELS = {
    0: "DrawPoint",
    1: "DrawSkill",
    2: "DrawPointToResolve",
    3: "Discard",
    4: "ModifyPoint",
    5: "Move",
    6: "Judge",
    7: "AddActionPoint",
    8: "Peek",
    9: "ChangeCardState",
}


def ensure_data_files():
    CARDS_DIR.mkdir(parents=True, exist_ok=True)
    CARD_FLOW_DIR.mkdir(parents=True, exist_ok=True)
    DECK_FILE.parent.mkdir(parents=True, exist_ok=True)

    if not DECK_FILE.exists():
        write_json_file(DECK_FILE, {"cards": []})

    if not GAME_CONFIG_FILE.exists():
        write_json_file(GAME_CONFIG_FILE, {})

    if not POINT_CARDS_FILE.exists():
        write_json_file(POINT_CARDS_FILE, {"cards": []})

    if not EFFECT_ANIMATION_OPTIONS_FILE.exists():
        write_json_file(EFFECT_ANIMATION_OPTIONS_FILE, {"options": DEFAULT_EFFECT_ANIMATION_OPTIONS})

    if not CARD_COMPLETION_FILE.exists():
        write_json_file(CARD_COMPLETION_FILE, {})


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
        return ensure_effect_animation_fields_on_card(deepcopy(card["card"]))

    if isinstance(card, dict):
        return ensure_effect_animation_fields_on_card(deepcopy(card))

    raise ValueError("Card data must be a JSON object.")


def normalize_deck_cards(cards):
    return [extract_card_core(card) for card in cards]


def ensure_effect_animation_fields_on_card(card_core):
    if not isinstance(card_core, dict):
        return card_core

    effects = card_core.get("effects")
    if not isinstance(effects, list):
        return card_core

    normalized_effects = []
    changed = False
    effect_animation_options = load_effect_animation_options()

    for effect in effects:
        if not isinstance(effect, dict):
            normalized_effects.append(effect)
            continue

        normalized_effect = deepcopy(effect)
        expected_animation = resolve_effect_animation_type(
            effect_type=normalized_effect.get("type", 0),
            current_animation_type=normalized_effect.get("effectAnimationType"),
            options=effect_animation_options,
        )
        if normalized_effect.get("effectAnimationType") != expected_animation:
            normalized_effect["effectAnimationType"] = expected_animation
            changed = True
        normalized_effects.append(normalized_effect)

    if changed:
        card_core["effects"] = normalized_effects

    return card_core


def resolve_effect_animation_type(effect_type, current_animation_type, options):
    try:
        normalized_effect_type = int(effect_type)
    except (TypeError, ValueError):
        normalized_effect_type = 0

    prefix = EFFECT_TYPE_LABELS.get(normalized_effect_type, "")
    if not prefix:
        return 0

    matching_options = [
        option for option in options
        if str(option.get("label", "")).split("_")[0] == prefix
    ]
    if not matching_options:
        return 0

    try:
        normalized_current = int(current_animation_type)
    except (TypeError, ValueError):
        normalized_current = None

    if normalized_current is not None and any(int(option["value"]) == normalized_current for option in matching_options):
        return normalized_current

    normal_option = next(
        (option for option in matching_options if str(option.get("label", "")).endswith("_Normal")),
        None,
    )
    if normal_option is not None:
        return int(normal_option["value"])

    return int(matching_options[0]["value"])


def load_card_completion_statuses():
    ensure_data_files()
    raw_statuses = read_json_file(CARD_COMPLETION_FILE)

    if not isinstance(raw_statuses, dict):
        return {}

    normalized = {}
    for key, value in raw_statuses.items():
        try:
            normalized[str(int(key))] = bool(value)
        except (TypeError, ValueError):
            continue

    return normalized


def write_card_completion_statuses(statuses):
    write_json_file(CARD_COMPLETION_FILE, statuses)


def resolve_card_flow_path(card_id: int):
    return CARD_FLOW_DIR / f"{CARD_FLOW_FILE_PREFIX}{int(card_id)}.json"


def resolve_legacy_card_flow_path(card_id: int):
    return DATA_DIR / f"{CARD_FLOW_FILE_PREFIX}{int(card_id)}.json"


def build_default_card_flow(card_id: int):
    return {
        "cardId": int(card_id),
        "engine": "drawflow",
        "drawflow": {
            "drawflow": {
                "Home": {
                    "data": {}
                }
            }
        },
    }


def load_card_flow(card_id: int):
    path = resolve_card_flow_path(card_id)
    legacy_path = resolve_legacy_card_flow_path(card_id)
    source_path = path if path.exists() else legacy_path

    if not source_path.exists():
        return build_default_card_flow(card_id)

    flow_document = read_json_file(source_path)
    if not isinstance(flow_document, dict):
        raise ValueError("Card flow JSON must be an object.")

    if source_path == legacy_path:
        flow_document["cardId"] = int(card_id)
        write_json_file(path, flow_document)
        legacy_path.unlink()

    return flow_document


def normalize_card_flow_payload(payload, card_id: int):
    if not isinstance(payload, dict):
        raise ValueError("Flow document must be a JSON object.")

    drawflow_document = payload.get("drawflow")
    if isinstance(drawflow_document, dict):
        return {
            "cardId": int(card_id),
            "engine": "drawflow",
            "drawflow": drawflow_document,
        }

    nodes = payload.get("nodes", [])
    edges = payload.get("edges", [])

    if not isinstance(nodes, list) or not isinstance(edges, list):
        raise ValueError("Flow document must contain nodes and edges arrays.")

    normalized_nodes = []
    normalized_edges = []
    node_ids = set()

    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            raise ValueError(f"nodes[{index}] must be an object.")

        node_id = str(node.get("id", "")).strip()
        if not node_id:
            raise ValueError(f"nodes[{index}].id is required.")

        node_type = str(node.get("type", "action")).strip()
        if node_type not in ("action", "decision"):
            raise ValueError(f"nodes[{index}].type must be action or decision.")

        normalized_node = {
            "id": node_id,
            "type": node_type,
            "label": str(node.get("label", "")).strip() or ("判断" if node_type == "decision" else "步骤"),
            "x": int(node.get("x", 0)),
            "y": int(node.get("y", 0)),
        }
        normalized_nodes.append(normalized_node)
        node_ids.add(node_id)

    for index, edge in enumerate(edges):
        if not isinstance(edge, dict):
            raise ValueError(f"edges[{index}] must be an object.")

        source = str(edge.get("source", "")).strip()
        target = str(edge.get("target", "")).strip()
        if not source or not target:
            raise ValueError(f"edges[{index}] must contain source and target.")
        if source not in node_ids or target not in node_ids:
            raise ValueError(f"edges[{index}] references an unknown node.")

        normalized_edges.append(
            {
                "id": str(edge.get("id", "")).strip() or f"edge_{index + 1}",
                "source": source,
                "target": target,
                "label": str(edge.get("label", "")).strip(),
            }
        )

    return {
        "cardId": int(card_id),
        "nodes": normalized_nodes,
        "edges": normalized_edges,
    }


def migrate_card_flow_file(previous_card_id: int, new_card_id: int):
    previous_path = resolve_card_flow_path(previous_card_id)
    legacy_previous_path = resolve_legacy_card_flow_path(previous_card_id)
    new_path = resolve_card_flow_path(new_card_id)

    if previous_card_id == new_card_id:
        return

    source_path = previous_path if previous_path.exists() else legacy_previous_path
    if not source_path.exists():
        return

    if new_path.exists():
        source_path.unlink()
        return

    flow_document = load_card_flow(previous_card_id)
    flow_document["cardId"] = int(new_card_id)
    write_json_file(new_path, flow_document)
    if source_path.exists():
        source_path.unlink()


def load_deck():
    ensure_data_files()
    deck_document = read_json_file(DECK_FILE)

    if isinstance(deck_document, list):
        normalized_cards = normalize_deck_cards(deck_document)
        if deck_document != normalized_cards:
            write_deck_file(DECK_FILE, normalized_cards)
        return normalized_cards

    if isinstance(deck_document, dict) and isinstance(deck_document.get("cards"), list):
        normalized_cards = normalize_deck_cards(deck_document["cards"])
        if deck_document.get("cards") != normalized_cards:
            write_deck_file(DECK_FILE, normalized_cards)
        return normalized_cards

    raise ValueError('SkillCardDeck.json must contain {"cards": [...]}')


def normalize_game_config_document(document):
    if not isinstance(document, dict):
        raise ValueError("GameConfig.json must be a JSON object.")

    return document


def load_game_config(path: Path = GAME_CONFIG_FILE):
    ensure_data_files()
    return normalize_game_config_document(read_json_file(path))


def write_game_config(path: Path, document):
    write_json_file(path, normalize_game_config_document(document))


def normalize_effect_animation_options_document(document):
    if not isinstance(document, dict):
        raise ValueError("EffectAnimationOptions.json must be a JSON object.")

    options = document.get("options")
    if not isinstance(options, list):
        raise ValueError('EffectAnimationOptions.json must contain {"options": [...]}')

    normalized_options = []
    for index, option in enumerate(options):
        if not isinstance(option, dict):
            raise ValueError(f"options[{index}] must be a JSON object.")

        value = option.get("value")
        label = option.get("label")

        try:
            normalized_value = int(value)
        except (TypeError, ValueError) as error:
            raise ValueError(f"options[{index}].value must be an integer.") from error

        normalized_label = str(label or "").strip()
        if not normalized_label:
            raise ValueError(f"options[{index}].label cannot be empty.")

        normalized_options.append(
            {
                "value": normalized_value,
                "label": normalized_label,
            }
        )

    return {"options": normalized_options}


def load_effect_animation_options(path: Path = EFFECT_ANIMATION_OPTIONS_FILE):
    ensure_data_files()
    document = normalize_effect_animation_options_document(read_json_file(path))
    return document["options"]


def normalize_point_cards_document(document):
    if not isinstance(document, dict):
        raise ValueError("PointCards.json must be a JSON object.")

    cards = document.get("cards")
    if not isinstance(cards, list):
        raise ValueError('PointCards.json must contain {"cards": [...]}')

    normalized_cards = []
    for index, card in enumerate(cards):
        if not isinstance(card, dict):
            raise ValueError(f"cards[{index}] must be a JSON object.")

        normalized_card = deepcopy(card)

        for field_name in ("id", "point", "type", "count"):
            if field_name in normalized_card:
                try:
                    normalized_card[field_name] = int(normalized_card[field_name])
                except (TypeError, ValueError) as error:
                    raise ValueError(f"cards[{index}].{field_name} must be an integer.") from error

        if "effects" in normalized_card and not isinstance(normalized_card["effects"], list):
            raise ValueError(f"cards[{index}].effects must be an array.")

        normalized_cards.append(normalized_card)

    return {"cards": normalized_cards}


def load_point_cards(path: Path = POINT_CARDS_FILE):
    ensure_data_files()
    return normalize_point_cards_document(read_json_file(path))


def write_point_cards(path: Path, document):
    write_json_file(path, normalize_point_cards_document(document))


def merge_point_card_counts(base_document, updated_document):
    normalized_base = normalize_point_cards_document(base_document)
    normalized_updated = normalize_point_cards_document(updated_document)
    updated_counts_by_id = {}

    for card in normalized_updated["cards"]:
        card_id = card.get("id")
        if card_id is None:
            continue
        updated_counts_by_id[int(card_id)] = int(card.get("count", 0))

    merged_cards = []
    for card in normalized_base["cards"]:
        merged_card = deepcopy(card)
        card_id = merged_card.get("id")
        if card_id is not None and int(card_id) in updated_counts_by_id:
            merged_card["count"] = updated_counts_by_id[int(card_id)]
        merged_cards.append(merged_card)

    return {"cards": merged_cards}


def sync_updated_card_into_deck(previous_card, updated_card):
    previous_core = extract_card_core(previous_card)
    updated_core = extract_card_core(updated_card)

    previous_id = previous_core.get("id")
    try:
        previous_id = int(previous_id)
    except (TypeError, ValueError):
        return load_deck(), 0

    deck = load_deck()
    updated_count = 0
    synchronized_deck = []

    for deck_card in deck:
        deck_core = extract_card_core(deck_card)
        deck_id = deck_core.get("id")
        try:
            deck_id = int(deck_id)
        except (TypeError, ValueError):
            deck_id = None

        if deck_id == previous_id:
            synchronized_deck.append(deepcopy(updated_core))
            updated_count += 1
        else:
            synchronized_deck.append(deck_core)

    if updated_count:
        write_deck_file(DECK_FILE, synchronized_deck)

    return synchronized_deck, updated_count


def build_card_descriptor(path: Path, completion_statuses=None):
    card = read_json_file(path)
    card_core = card.get("card") if isinstance(card, dict) else None
    if not isinstance(card_core, dict):
        card_core = card
    display_name = None
    card_id = path.stem

    if isinstance(card_core, dict):
        display_name = (
            card_core.get("name")
            or card_core.get("title")
            or card_core.get("cardName")
            or card_core.get("CardName")
        )
        try:
            card_id = int(card_core.get("id"))
        except (TypeError, ValueError):
            card_id = path.stem

    if completion_statuses is None:
        completion_statuses = load_card_completion_statuses()

    return {
        "id": card_id,
        "fileName": path.name,
        "name": display_name or path.stem,
        "card": card,
        "isCompleted": bool(completion_statuses.get(str(card_id), False)),
    }


def load_cards():
    ensure_data_files()
    cards = []
    completion_statuses = load_card_completion_statuses()

    for path in sorted(CARDS_DIR.glob("card_*.json")):
        cards.append(build_card_descriptor(path, completion_statuses))

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


@main_bp.route("/game-config")
def game_config():
    return render_template("game_config.html")


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


@main_bp.get("/api/effect-animation-options")
def get_effect_animation_options():
    try:
        return jsonify(
            {
                "options": load_effect_animation_options(),
                "localPath": str(EFFECT_ANIMATION_OPTIONS_FILE),
            }
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error), "localPath": str(EFFECT_ANIMATION_OPTIONS_FILE)}), 500


@main_bp.get("/api/game-config")
def get_game_config():
    try:
        return jsonify(
            {
                "config": load_game_config(),
                "localPath": str(GAME_CONFIG_FILE),
            }
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error), "localPath": str(GAME_CONFIG_FILE)}), 500


@main_bp.post("/api/game-config")
def save_game_config():
    payload = request.get_json(silent=True) or {}
    config = payload.get("config")

    if config is None:
        return jsonify({"error": "config is required."}), 400

    try:
        write_game_config(GAME_CONFIG_FILE, config)
        return jsonify(
            {
                "config": load_game_config(),
                "localPath": str(GAME_CONFIG_FILE),
                "message": "Game config saved locally.",
            }
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error), "localPath": str(GAME_CONFIG_FILE)}), 500


@main_bp.post("/api/game-config/upload-game-server")
def upload_game_config_to_game_server():
    payload = request.get_json(silent=True) or {}
    config = payload.get("config")

    if config is None:
        return jsonify({"error": "config is required."}), 400

    try:
        normalized_config = normalize_game_config_document(config)
        target_path = Path(GAME_SERVER_CONFIG_PATH)

        if not target_path.parent.exists():
            return jsonify(
                {
                    "error": f"Game server path does not exist: {target_path.parent}",
                    "targetPath": GAME_SERVER_CONFIG_PATH,
                }
            ), 500

        write_game_config(GAME_CONFIG_FILE, normalized_config)
        write_game_config(target_path, normalized_config)
        return jsonify(
            {
                "config": normalized_config,
                "localPath": str(GAME_CONFIG_FILE),
                "targetPath": GAME_SERVER_CONFIG_PATH,
                "message": "Game config uploaded to game server.",
            }
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error), "targetPath": GAME_SERVER_CONFIG_PATH}), 500


@main_bp.post("/api/game-config/fetch-game-server")
def fetch_game_config_from_game_server():
    try:
        target_path = Path(GAME_SERVER_CONFIG_PATH)

        if not target_path.exists():
            return jsonify(
                {
                    "error": f"Game server config not found: {target_path}",
                    "targetPath": GAME_SERVER_CONFIG_PATH,
                }
            ), 404

        config = load_game_config(target_path)
        write_game_config(GAME_CONFIG_FILE, config)
        return jsonify(
            {
                "config": config,
                "localPath": str(GAME_CONFIG_FILE),
                "targetPath": GAME_SERVER_CONFIG_PATH,
                "message": "Game config fetched from game server.",
            }
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error), "targetPath": GAME_SERVER_CONFIG_PATH}), 500


@main_bp.get("/api/point-cards")
def get_point_cards():
    try:
        return jsonify(
            {
                "document": load_point_cards(),
                "localPath": str(POINT_CARDS_FILE),
            }
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error), "localPath": str(POINT_CARDS_FILE)}), 500


@main_bp.post("/api/point-cards")
def save_point_cards():
    payload = request.get_json(silent=True) or {}
    document = payload.get("document")

    if document is None:
        return jsonify({"error": "document is required."}), 400

    try:
        merged_document = merge_point_card_counts(load_point_cards(), document)
        write_point_cards(POINT_CARDS_FILE, merged_document)
        return jsonify(
            {
                "document": load_point_cards(),
                "localPath": str(POINT_CARDS_FILE),
                "message": "Point cards saved locally.",
            }
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error), "localPath": str(POINT_CARDS_FILE)}), 500


@main_bp.post("/api/point-cards/upload-game-server")
def upload_point_cards_to_game_server():
    payload = request.get_json(silent=True) or {}
    document = payload.get("document")

    if document is None:
        return jsonify({"error": "document is required."}), 400

    try:
        merged_document = merge_point_card_counts(load_point_cards(), document)
        target_path = Path(GAME_SERVER_POINT_CARDS_PATH)

        if not target_path.parent.exists():
            return jsonify(
                {
                    "error": f"Game server path does not exist: {target_path.parent}",
                    "targetPath": GAME_SERVER_POINT_CARDS_PATH,
                }
            ), 500

        write_point_cards(POINT_CARDS_FILE, merged_document)
        write_point_cards(target_path, merged_document)
        return jsonify(
            {
                "document": merged_document,
                "localPath": str(POINT_CARDS_FILE),
                "targetPath": GAME_SERVER_POINT_CARDS_PATH,
                "message": "Point cards uploaded to game server.",
            }
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error), "targetPath": GAME_SERVER_POINT_CARDS_PATH}), 500


@main_bp.post("/api/point-cards/fetch-game-server")
def fetch_point_cards_from_game_server():
    try:
        target_path = Path(GAME_SERVER_POINT_CARDS_PATH)

        if not target_path.exists():
            return jsonify(
                {
                    "error": f"Game server point cards not found: {target_path}",
                    "targetPath": GAME_SERVER_POINT_CARDS_PATH,
                }
            ), 404

        document = load_point_cards(target_path)
        write_point_cards(POINT_CARDS_FILE, document)
        return jsonify(
            {
                "document": document,
                "localPath": str(POINT_CARDS_FILE),
                "targetPath": GAME_SERVER_POINT_CARDS_PATH,
                "message": "Point cards fetched from game server.",
            }
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error), "targetPath": GAME_SERVER_POINT_CARDS_PATH}), 500


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
        card_document = read_json_file(path)
        card_id = int(extract_card_core(card_document)["id"])
        path.unlink()
        flow_path = resolve_card_flow_path(card_id)
        legacy_flow_path = resolve_legacy_card_flow_path(card_id)
        if flow_path.exists():
            flow_path.unlink()
        if legacy_flow_path.exists():
            legacy_flow_path.unlink()
        return jsonify({"deletedFileName": file_name})
    except OSError as error:
        return jsonify({"error": str(error)}), 500
    except (ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error)}), 500


@main_bp.post("/api/card-file/save")
def save_card_file():
    payload = request.get_json(silent=True) or {}
    current_file_name = str(payload.get("currentFileName", "")).strip()
    document = payload.get("document")

    if not isinstance(document, dict):
        return jsonify({"error": "document must be a JSON object."}), 400

    try:
        completion_statuses = load_card_completion_statuses()
        target_file_name = build_card_file_name_from_document(document)
        target_path = resolve_card_path(target_file_name, must_exist=False)
        if target_path is None:
            return jsonify({"error": "Unable to resolve target card file path."}), 400

        current_path = None
        previous_card_id = None
        if current_file_name:
            current_path = resolve_card_path(current_file_name, must_exist=True)
            if current_path is None:
                return jsonify({"error": f"Card file not found: {current_file_name}"}), 404
            current_document = read_json_file(current_path)
            previous_card_core = extract_card_core(current_document)
            previous_card_id = int(previous_card_core["id"])

        if current_path is None and target_path.exists():
            return jsonify({"error": f"Target card file already exists: {target_file_name}"}), 409

        if (
            current_path is not None
            and current_path != target_path
            and target_path.exists()
        ):
            return jsonify({"error": f"Target card file already exists: {target_file_name}"}), 409

        write_json_file(target_path, document)

        new_card_id = int(extract_card_core(document)["id"])
        if previous_card_id is not None and previous_card_id != new_card_id:
            previous_status = completion_statuses.pop(str(previous_card_id), None)
            if previous_status is not None and str(new_card_id) not in completion_statuses:
                completion_statuses[str(new_card_id)] = previous_status
            write_card_completion_statuses(completion_statuses)
            migrate_card_flow_file(previous_card_id, new_card_id)

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


@main_bp.get("/api/card-flow")
def get_card_flow():
    card_id = request.args.get("cardId")

    try:
        normalized_card_id = int(card_id)
        if normalized_card_id <= 0:
            return jsonify({"error": "cardId must be greater than 0."}), 400

        return jsonify({"flow": load_card_flow(normalized_card_id)})
    except (TypeError, ValueError):
        return jsonify({"error": "cardId must be an integer."}), 400
    except (OSError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error)}), 500


@main_bp.post("/api/card-flow")
def save_card_flow():
    payload = request.get_json(silent=True) or {}
    card_id = payload.get("cardId")
    flow = payload.get("flow")

    try:
        normalized_card_id = int(card_id)
        if normalized_card_id <= 0:
            return jsonify({"error": "cardId must be greater than 0."}), 400

        normalized_flow = normalize_card_flow_payload(flow, normalized_card_id)
        path = resolve_card_flow_path(normalized_card_id)
        legacy_path = resolve_legacy_card_flow_path(normalized_card_id)
        write_json_file(path, normalized_flow)
        if legacy_path.exists():
            legacy_path.unlink()
        return jsonify({"flow": normalized_flow, "path": str(path)})
    except (TypeError, ValueError) as error:
        return jsonify({"error": str(error)}), 400
    except (OSError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error)}), 500


@main_bp.get("/api/deck/chinese-chars")
def export_deck_chinese_chars():
    try:
        deck_document = read_json_file(DECK_FILE)
        content = dump_json_text(deck_document)
        chinese_chars = "".join(sorted(set(re.findall(r"[\u4e00-\u9fff]", content))))
        buffer = BytesIO(chinese_chars.encode("utf-8"))
        buffer.seek(0)

        return send_file(
            buffer,
            as_attachment=True,
            download_name="SkillCardDeck_ChineseChars.txt",
            mimetype="text/plain",
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error)}), 500


@main_bp.post("/api/card-completion")
def update_card_completion():
    payload = request.get_json(silent=True) or {}
    card_id = payload.get("cardId")
    is_completed = payload.get("isCompleted")

    try:
        normalized_card_id = int(card_id)
    except (TypeError, ValueError):
        return jsonify({"error": "cardId must be an integer."}), 400

    if normalized_card_id <= 0:
        return jsonify({"error": "cardId must be greater than 0."}), 400

    if not isinstance(is_completed, bool):
        return jsonify({"error": "isCompleted must be a boolean."}), 400

    try:
        statuses = load_card_completion_statuses()
        statuses[str(normalized_card_id)] = is_completed
        write_card_completion_statuses(statuses)
        return jsonify({"cardId": normalized_card_id, "isCompleted": is_completed})
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return jsonify({"error": str(error)}), 500


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

        previous_card = deepcopy(editable_card)

        for key, value in normalized.items():
            editable_card[key] = value

        write_json_file(card_path, card_document)
        deck, updated_deck_card_count = sync_updated_card_into_deck(previous_card, editable_card)
        return jsonify(
            {
                "card": build_card_descriptor(card_path),
                "deck": deck,
                "updatedDeckCardCount": updated_deck_card_count,
            }
        )
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
