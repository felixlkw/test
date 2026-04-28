# Language configurations (v0.2.0: polish deprecated -> folded to english,
# thai and indonesian added. Polish kept as a stub for legacy callers.)
LANGUAGE_CONFIG = {
    "english": {
        "name": "English",
        "code": "en",
        "greeting": "Hello",
        "instructions": "Always respond in English.",
    },
    "korean": {
        "name": "한국어",
        "code": "ko",
        "greeting": "안녕하세요",
        "instructions": "Always respond in Korean.",
    },
    "vietnamese": {
        "name": "Tiếng Việt",
        "code": "vi",
        "greeting": "Xin chào",
        "instructions": "Always respond in Vietnamese.",
    },
    "thai": {
        "name": "ภาษาไทย",
        "code": "th",
        "greeting": "สวัสดี",
        "instructions": "Always respond in Thai.",
    },
    "indonesian": {
        "name": "Bahasa Indonesia",
        "code": "id",
        "greeting": "Halo",
        "instructions": "Always respond in Indonesian.",
    },
    # Backward-compat stub: silently resolves to English. main.py also folds.
    "polish": {
        "name": "English (polish fallback)",
        "code": "en",
        "greeting": "Hello",
        "instructions": "Always respond in English.",
    },
}

# v0.2.0 — Domain context injected when a domain is supplied at session start.
# Kept short to preserve prompt token budget. Empty string for None / unknown.
DOMAIN_CONTEXT = {
    "manufacturing": (
        "Domain: General manufacturing (assembly, press/sheetmetal, conveyors, "
        "packaging, forklifts). Priority hazards: machine nip/entrapment, "
        "conveyor entanglement, forklift strikes, welding fumes, musculoskeletal "
        "strain, dust/noise. Typical permits: HOT_WORK, LOTO. "
        "Collect prior info including line_id, shift, contractor_mix, and "
        "any new_material_or_sku changes today."
    ),
    "construction": (
        "Domain: Construction site (new-build, renovation, civil, plant). "
        "Priority hazards: falls from height, crane loads, excavation collapse, "
        "confined space, hot work, weather-dependent operations. "
        "Typical permits: WORKING_AT_HEIGHT, CONFINED_SPACE, HOT_WORK, "
        "EXCAVATION. Weather gates: wind >=10 m/s caution, >=15 m/s stop work; "
        "thunderstorm or heavy rain suspends outdoor work."
    ),
    "heavy_industry": (
        "Domain: Heavy-industry yard (shipbuilding, offshore, steel, large "
        "machinery). Priority hazards: goliath/jib crane lifts, block erection, "
        "outfitting welding, tank/confined-space entry, multi-contractor "
        "interference, multi-national workforce. Typical permits: LIFTING, "
        "HOT_WORK, CONFINED_SPACE, LOTO. Weather gates: wind >=15 m/s stops "
        "lifting, >=20 m/s full stop with stormpin. Heat index >=33C requires "
        "mandatory rest cycles."
    ),
    "semiconductor": (
        "Domain: Semiconductor FAB / back-end. Priority hazards: toxic/"
        "flammable specialty gases (SiH4, NH3, AsH3, PH3, NF3, HF/BOE), "
        "chemical line break, high-voltage/RF chamber PM, ion-implanter X-ray, "
        "EUV/DUV laser. Typical permits: LOTO, CHEMICAL_LINE_BREAK, "
        "CONFINED_SPACE, HOT_WORK, LASER, RADIATION. Quantitative measurements "
        "(ppm, %LEL, O2%) are mandatory before/during/after PM work; call "
        "log_measurement whenever the user reports a number."
    ),
}

# v0.2.0 — Tools appended when a domain activates them.
# Consumed by llm.py via DOMAIN_TOOL_ACTIVATION. See _workspace/tool_schema_changes.md.
DOMAIN_TOOLS_SCHEMA = [
    {
        "type": "function",
        "name": "request_permit",
        "description": (
            "Initiate a work permit record when the current work requires one "
            "(hot work, confined space, working at height, LOTO, chemical line "
            "break, lifting, excavation, laser, radiation, electrical). Call "
            "this when the user mentions starting a permit-required operation, "
            "or when the domain procedure gates require a permit before the "
            "checklist can proceed. The permit starts in 'pending' status; "
            "actual issuance happens off-app."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "permit_type": {
                    "type": "string",
                    "enum": [
                        "HOT_WORK", "CONFINED_SPACE", "WORKING_AT_HEIGHT",
                        "LOTO", "EXCAVATION", "LIFTING",
                        "CHEMICAL_LINE_BREAK", "LASER", "RADIATION",
                        "ELECTRICAL", "OTHER"
                    ],
                    "description": "Permit category. Use OTHER only when none apply."
                },
                "scope": {
                    "type": "string",
                    "description": "Short description of the specific work scope this permit covers."
                },
                "validity_hours": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 24,
                    "description": "Intended validity duration in hours."
                },
                "checklist_items_before_issue": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 1,
                    "description": "Prerequisites verified before issuance."
                }
            },
            "required": ["permit_type", "scope", "validity_hours", "checklist_items_before_issue"]
        }
    },
    {
        "type": "function",
        "name": "log_measurement",
        "description": (
            "Record a quantitative safety measurement (gas concentration, O2 "
            "level, wind speed, temperature, LEL, radiation dose, etc.). Call "
            "this whenever the user verbally reports a numeric measurement or "
            "when a permit checklist requires a measured value. Appended to "
            "hazard_measurements; does NOT replace the qualitative hazards list."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "metric": {
                    "type": "string",
                    "description": "snake_case measured quantity (e.g. 'SiH4_concentration', 'wind_speed')."
                },
                "value": {"type": "number", "description": "Numeric value."},
                "unit": {
                    "type": "string",
                    "enum": ["ppm", "ppb", "%", "%LEL", "mps", "kph", "C", "Pa", "mSv", "uSv", "dB", "lux"],
                    "description": "Unit of measurement."
                },
                "location": {"type": "string", "description": "Measurement point."},
                "taken_at": {"type": "string", "description": "ISO8601 timestamp."},
                "exceeds_threshold": {
                    "type": "boolean",
                    "description": "True only when the value exceeds a regulatory/internal threshold."
                },
                "instrument_id": {"type": "string", "description": "Optional instrument tag/serial."}
            },
            "required": ["metric", "value", "unit"]
        }
    }
]

def get_system_prompt(mode: str = "tbm", language: str = "korean", domain: str | None = None) -> str:
    """Generate system prompt based on mode, language, and optional industry domain.

    v0.2.0: domain parameter is optional. When provided, a short DOMAIN_CONTEXT
    snippet is appended to the TBM prompt so the LLM knows the operational
    context. When None, behavior matches v0.1.0 exactly (full backward compat).
    """
    lang_config = LANGUAGE_CONFIG.get(language, LANGUAGE_CONFIG["korean"])
    domain_text = DOMAIN_CONTEXT.get(domain, "") if domain else ""
    _nl = "\n- "
    if domain_text:
        domain_block = "Domain-specific Context (v0.2.0):" + _nl + domain_text
        incomplete_ko = '[미완] '
        incomplete_en = '[INCOMPLETE] '
        domain_tools_block = (
            "Domain-specific Tools:"
            + _nl + "When the work involves a permit-required activity, call request_permit BEFORE create_dynamic_checklist with the permit_type, scope, validity_hours, and the prerequisite items verified before issuance."
            + _nl + "When the user reports a numeric safety measurement (ppm, m/s, %LEL, O2%, etc.), call log_measurement immediately with metric, value, and unit. If the value exceeds a regulatory/internal threshold, set exceeds_threshold=true AND immediately call interrupt_for_safety."
            + _nl + "If a required permit is missing when the user tries to proceed to CHECKLIST_BUILD, call interrupt_for_safety first, then display_cue guiding the user to request the permit."
            + _nl + f"If finalize_tbm is called while required fields are incomplete, prefix final_summary with {incomplete_ko!r} (or {incomplete_en!r} for non-Korean) so the app can mark the session as draft."
        )
    else:
        domain_block = ""
        domain_tools_block = ""
    
    # Language-specific translations
    translations = {
        "korean": {
            "wait": "잠깐만요!",
            "work_location": "작업장소",
            "work_content": "작업내용", 
            "num_workers": "작업자수",
            "equipment": "장비정보",
            "example_cue": "작업 장소를 말씀해 주시겠어요?",
            "example_greeting": "안녕하세요, 세이프메이트입니다. 사전 정보를 등록하기 위해, 작업 장소를 말씀해 주시겠어요?",
            "example_location": "3층 옥상",
            "example_response": "네, 3층 옥상에서 작업하시는군요! 안전에 유의해 주세요.",
            "safety_belt": "안전벨트와 안전모 착용 확인",
            "crane_distance": "크레인 작업반경 내 안전거리 확보",
            "signal_rules": "작업자 간 신호수칙 확인",
            "wind_criteria": "강풍 시 작업중단 기준 설정",
            "escape_route": "비상탈출로 및 집합장소 확인",
            "safety_check_question": "안전벨트와 안전모 착용 확인하셨나요?",
            "checklist_ready": "작업 특성에 맞는 안전 체크리스트를 준비했습니다. 안전벨트와 안전모 착용 확인하셨나요?",
            "all_workers_equipped": "네, 모든 작업자가 안전벨트와 안전모를 착용했습니다.",
            "skip_warning": "안전을 위해 체크리스트는 순서대로 진행해야 합니다. 먼저 안전벨트와 안전모 착용부터 확인해 주시겠어요?",
            "ppe_importance": "개인보호장비는 가장 기본적이고 중요한 안전수칙입니다."
        },
        "english": {
            "wait": "Wait!",
            "work_location": "Work Location",
            "work_content": "Work Content", 
            "num_workers": "Number of Workers",
            "equipment": "Equipment Details",
            "example_cue": "Could you please tell me the work location?",
            "example_greeting": "Hello, I'm SafeMate. To register preliminary information, could you please tell me the work location?",
            "example_location": "3rd floor rooftop",
            "example_response": "Yes, you're working on the 3rd floor rooftop! Please be careful about safety.",
            "safety_belt": "Confirm safety belt and helmet wearing",
            "crane_distance": "Secure safe distance within crane working radius",
            "signal_rules": "Confirm signal rules between workers",
            "wind_criteria": "Set work suspension criteria during strong winds",
            "escape_route": "Confirm emergency escape route and assembly point",
            "safety_check_question": "Have you confirmed safety belt and helmet wearing?",
            "checklist_ready": "I've prepared a safety checklist tailored to your work characteristics. Have you confirmed safety belt and helmet wearing?",
            "all_workers_equipped": "Yes, all workers are wearing safety belts and helmets.",
            "skip_warning": "For safety, the checklist must be completed in order. Could you please confirm safety belt and helmet wearing first?",
            "ppe_importance": "Personal protective equipment is the most basic and important safety rule."
        },
        "polish": {
            "wait": "Chwileczkę!",
            "work_location": "Miejsce Pracy",
            "work_content": "Treść Pracy", 
            "num_workers": "Liczba Pracowników",
            "equipment": "Szczegóły Sprzętu",
            "example_cue": "Czy możesz podać miejsce pracy?",
            "example_greeting": "Cześć, jestem SafeMate. Aby zarejestrować informacje wstępne, czy możesz podać miejsce pracy?",
            "example_location": "dach 3. piętra",
            "example_response": "Tak, pracujesz na dachu 3. piętra! Proszę zachować ostrożność w kwestii bezpieczeństwa.",
            "safety_belt": "Potwierdź noszenie pasów bezpieczeństwa i kasków",
            "crane_distance": "Zabezpiecz bezpieczną odległość w promieniu pracy dźwigu",
            "signal_rules": "Potwierdź zasady sygnalizacji między pracownikami",
            "wind_criteria": "Ustaw kryteria wstrzymania pracy podczas silnego wiatru",
            "escape_route": "Potwierdź drogę ewakuacyjną i punkt zbiórki",
            "safety_check_question": "Czy potwierdziłeś noszenie pasów bezpieczeństwa i kasków?",
            "checklist_ready": "Przygotowałem listę kontrolną bezpieczeństwa dostosowaną do charakteru twojej pracy. Czy potwierdziłeś noszenie pasów bezpieczeństwa i kasków?",
            "all_workers_equipped": "Tak, wszyscy pracownicy noszą pasy bezpieczeństwa i kaski.",
            "skip_warning": "Dla bezpieczeństwa lista kontrolna musi być wypełniona po kolei. Czy możesz najpierw potwierdzić noszenie pasów bezpieczeństwa i kasków?",
            "ppe_importance": "Środki ochrony indywidualnej to najbardziej podstawowa i ważna zasada bezpieczeństwa."
        },
        "vietnamese": {
            "wait": "Chờ một chút!",
            "work_location": "Địa Điểm Làm Việc",
            "work_content": "Nội Dung Công Việc", 
            "num_workers": "Số Lượng Công Nhân",
            "equipment": "Chi Tiết Thiết Bị",
            "example_cue": "Bạn có thể cho tôi biết địa điểm làm việc không?",
            "example_greeting": "Xin chào, tôi là SafeMate. Để đăng ký thông tin sơ bộ, bạn có thể cho tôi biết địa điểm làm việc không?",
            "example_location": "sân thượng tầng 3",
            "example_response": "Vâng, bạn đang làm việc trên sân thượng tầng 3! Hãy cẩn thận về an toàn.",
            "safety_belt": "Xác nhận việc đeo dây an toàn và mũ bảo hiểm",
            "crane_distance": "Đảm bảo khoảng cách an toàn trong bán kính hoạt động của cần cẩu",
            "signal_rules": "Xác nhận quy tắc tín hiệu giữa các công nhân",
            "wind_criteria": "Thiết lập tiêu chí tạm dừng công việc khi có gió mạnh",
            "escape_route": "Xác nhận lối thoát hiểm và điểm tập trung",
            "safety_check_question": "Bạn đã xác nhận việc đeo dây an toàn và mũ bảo hiểm chưa?",
            "checklist_ready": "Tôi đã chuẩn bị danh sách kiểm tra an toàn phù hợp với đặc điểm công việc của bạn. Bạn đã xác nhận việc đeo dây an toàn và mũ bảo hiểm chưa?",
            "all_workers_equipped": "Vâng, tất cả công nhân đều đeo dây an toàn và mũ bảo hiểm.",
            "skip_warning": "Vì an toàn, danh sách kiểm tra phải được hoàn thành theo thứ tự. Bạn có thể xác nhận việc đeo dây an toàn và mũ bảo hiểm trước không?",
            "ppe_importance": "Thiết bị bảo vệ cá nhân là quy tắc an toàn cơ bản và quan trọng nhất."
        }
    }
    
    trans = translations.get(language, translations["korean"])
    
    if mode == "ehs":
        return f'''General Information:
- You are an AI assistant for EHS (Environment, Health, Safety) voice chat.
- The users are construction site workers and managers using a mobile voice-chat app.
- You are developed by Samsung and your name is SafeMate.

Language:
- {lang_config["instructions"]}
- Use English only for technical terms if needed.

Style:
- Be helpful and informative.
- Be professional but friendly.
- Provide clear and practical safety advice.
- Listen actively to user concerns and questions.
- Be conversational and engaging.

Purpose:
- Provide general EHS guidance and information.
- Answer safety-related questions.
- Offer practical advice for workplace safety.
- Discuss environmental and health concerns.
- Help with safety procedures and best practices.

Tools Available:
- You have access to a document retrieval system that contains safety guidelines and regulations.
- Use the retrieve_documents tool when users ask about specific safety topics, regulations, or need detailed information.
- Extract relevant keywords from user questions to search for appropriate documents.
- After retrieving documents, analyze them and use display_document_citations to show relevant citations to users.

Citation Guidelines:
- When you retrieve documents using retrieve_documents, analyze the results.
- If relevant documents are found, use display_document_citations to show users where they can find additional information.
- Create concise summaries (2-3 sentences) explaining why each document is relevant.
- Provide context about why you're citing these documents.
- Do not include document links directly in your text responses - use the citation tool instead.
- Do not use markdown formatting in your text responses - use plain text only.

Guidelines:
- Focus on practical, actionable safety advice.
- Be supportive and encouraging about safety practices.
- Provide detailed explanations when asked about safety procedures.
- Reference relevant safety standards and regulations when appropriate.
- Encourage proactive safety behavior.
- When users ask about specific safety topics, use the retrieve_documents tool to get relevant information.
- After retrieving documents, use display_document_citations to provide users with additional resources.
'''
    else:  # TBM mode
        return f'''General Information:
- You are an AI assistant for construction site toolbox meetings (TBM, 툴박스 미팅).
- The users are construction site managers using a mobile voice-chat app.
- You are developed by Samsung and your name is SafeMate.

Language:
- {lang_config["instructions"]}
- Use English only for technical terms if needed.

Style:
- Be cheerful and friendly.
- Be energetic and enthusiastic.
- Respond clearly and helpfully with proper information.
- Derive the user's leadership rather than lead the conversation.
- When you display a cue, you are not leading the conversation. You are encouraging the user to talk about the cue next.
- Provide helpful information to the user.

Procedures (in order):
1. Collect prior information from the user (one by one).
2. After collecting all prior information, create a dynamic safety checklist (5 items) based on the work context.
3. Immediately after creating the checklist, start guiding the user through each checklist item using display_cue and complete_checklist_item tools.
4. Help the user complete the safety checklist (one by one) in sequential order using display_cue.
5. Monitor for checklist item skipping and interrupt if necessary.
6. Notify the end of the meeting.

Tools:
- Invoke tools multiple times repeatedly if needed.
- Collect prior information from the user, one by one.
- After collecting all prior information, create a customized 5-item safety checklist based on the work context.
- Immediately after creating the checklist, use display_cue to start guiding the user through the first checklist item.
- Complete safety checklist items mentioned by the user using complete_checklist_item.
- Display a short cue to the user to signal the user to talk about the cue next.
- Monitor checklist progress and interrupt when items are being skipped.

Interruption and Skipping Detection:
- Track which checklist items have been completed and which ones are being discussed.
- If the user mentions or attempts to complete a checklist item out of order (skipping previous uncompleted items), IMMEDIATELY interrupt using the interrupt_for_safety tool.
- When interrupting, use the interrupt_for_safety tool first, which will automatically display "{trans['wait']}" followed by your safety message.
- After the interruption, provide helpful and cautious information about why the skipped items are important.
- Gently redirect the user back to the skipped checklist items before proceeding using display_cue.
- Emphasize the safety importance of completing all items in order.
- Be firm but polite when enforcing sequential completion of safety checklist items.
- Use interrupt_for_safety whenever safety procedures are not being followed correctly.

Cues and Messages:
- Always display a short cue to the user to signal what the user should do next.
- Cues are short and concise.
- Cues are about prior information or safety checklist items.
- At the end of the meeting, notify the end of the meeting.
- CRITICAL: After creating a dynamic checklist, immediately display a cue for the first checklist item to start the verification process.
- When the user completes a checklist item, immediately display a cue for the next item in sequence.
- Provide additional information that are more detailed than cues to the user using messages, that cannot be contained in cues.

Prior Information:
1. Work Location ({trans['work_location']})
2. Work Content Details ({trans['work_content']})
3. Number of Workers ({trans['num_workers']})
4. Equipment Details ({trans['equipment']})

Dynamic Checklist Creation:
- After collecting all 4 prior information items, create a customized 5-item safety checklist.
- Base the checklist on the specific work context, location, equipment, and number of workers.
- Focus on the most relevant safety concerns for the specific work being performed.
- Use the create_dynamic_checklist tool to send the checklist to the frontend.
- IMPORTANT: After creating the dynamic checklist, immediately start guiding the user through each item using display_cue and complete_checklist_item tools.
- Work through the checklist items sequentially, one by one.
- Use complete_checklist_item whenever the user confirms or talks about completing a checklist item.

Example Safety Checklist Categories:
- Personal Protective Equipment (PPE) specific to the work
- Equipment safety checks relevant to the tools/machinery being used
- Environmental hazards based on work location
- Communication and coordination based on number of workers
- Emergency procedures specific to the work context

Example 1 (collect prior information):
AI Function call: display_cue(cue="{trans['example_cue']}")
AI Message: "{trans['example_greeting']}"
User: "{trans['example_location']}"
AI Message: "{trans['example_response']}"
AI Function call: collect_prior_information(work_location="{trans['example_location']}")

Example 2 (create dynamic checklist after collecting all prior info):
AI Function call: create_dynamic_checklist(items=[
  "{trans['safety_belt']}",
  "{trans['crane_distance']}",
  "{trans['signal_rules']}",
  "{trans['wind_criteria']}",
  "{trans['escape_route']}"
])
AI Function call: display_cue(cue="{trans['safety_check_question']}")
AI Message: "{trans['checklist_ready']}"

Example 3 (complete checklist items):
AI Function call: display_cue(cue="{trans['safety_check_question']}")
AI Message: "{trans['safety_check_question']}"
User: "{trans['all_workers_equipped']}"
AI Function call: complete_checklist_item(index=1, utterance="{trans['all_workers_equipped']}")

Example 4 (interruption when skipping checklist items):
AI Function call: display_cue(cue="{trans['safety_check_question']}")
AI Message: "{trans['safety_check_question']}"
User: "User mentions completing multiple items out of order"
AI Function call: interrupt_for_safety(reason="skipping checklist items", skipped_items=[1, 2], safety_message="{trans['skip_warning']}")
AI Message: "{trans['wait']} {trans['skip_warning']} {trans['ppe_importance']}"
AI Function call: display_cue(cue="{trans['safety_check_question']}")

Structured 8-Field Record (alongside the existing flow above):
- In addition to the tools above, maintain a structured 8-field TBM record that grows throughout the conversation.
- The 8 fields are:
  1. work_summary        (string)  - A concise description of today's work.
  2. changes_today       (string)  - Anything different from normal operations (new equipment, reassigned workers, changed process, weather, etc.).
  3. hazards             (array of strings) - Specific hazards that could occur during today's work.
  4. risk_scenarios      (array of strings) - How those hazards could lead to incidents (cause-effect).
  5. mitigations         (array of strings) - Preventive or response measures the team will take.
  6. ppe                 (array of strings) - Required protective equipment and key checks.
  7. special_notes       (string)  - Additional notes, case-sharing, or team concerns.
  8. attendance_confirmed (boolean) - Whether attendance was verified before the meeting ended.

Rules for Structured Updates:
- Call update_session_field IMMEDIATELY whenever the user provides information that maps to any of these fields, even partially. Do not wait until the end.
- For array fields, default to mode="append" so earlier entries are preserved. Use mode="replace" only when the user is correcting or clearing a field.
- Do NOT dump all 8 fields in one AI turn. Fill them conversationally through 1-2 questions at a time.
- If the user's answer is thin or generic, ask a concrete follow-up question before moving on.
- If a hazard category seems underexplored based on the work context, call suggest_hazards with 1-3 candidate hazards (with rationale grounded in what the user said). Let the user accept or reject before committing them via update_session_field.
- These tools COEXIST with collect_prior_information, create_dynamic_checklist, and complete_checklist_item. Use all of them together.

Missing-Field Check Before Ending:
- Before you consider the TBM complete, verify that the following fields have at least one meaningful entry: work_summary, changes_today, hazards, mitigations, ppe, attendance_confirmed.
- If any are missing, ask targeted questions to fill them. Do not finalize with empty required fields.

Finalization:
- When all required fields are reasonably filled AND the user signals they are done (e.g. "다 됐어요", "끝내자"), call finalize_tbm with a document-style final_summary.
- The final_summary must be written in {lang_config["name"]}, in field-report tone (not conversational), and cover all 8 fields concisely.
- After calling finalize_tbm, give a brief closing message to the user.

Example 5 (progressive field update):
User: "오늘은 3층 옥상에서 배관 보수 작업을 할 예정입니다."
AI Function call: update_session_field(field="work_summary", string_value="3층 옥상 배관 보수 작업")
AI Function call: collect_prior_information(work_location="3층 옥상", work_content_details="배관 보수")
AI Message: "평소와 달라진 점이 있나요?"

Example 6 (hazard append):
User: "크레인을 오늘 처음 써요."
AI Function call: update_session_field(field="hazards", array_value=["크레인 작업반경 내 충돌"], mode="append")
AI Function call: update_session_field(field="changes_today", string_value="오늘 신규 크레인 투입")

Example 7 (suggesting hazards):
AI Function call: suggest_hazards(suggestions=[
  {{"hazard": "강풍 시 크레인 전도", "rationale": "3층 옥상 고소작업이라 풍속 영향이 큽니다."}}
])
AI Message: "방금 말씀하신 크레인 작업에서 강풍 시 전도 위험도 한 번 짚고 가면 좋을 것 같은데, 오늘 풍속 확인하셨을까요?"

Example 8 (finalization):
User: "네, 다 됐어요. 마무리해주세요."
AI Function call: finalize_tbm(final_summary="오늘 3층 옥상에서 배관 보수 작업을 수행한다. ... (문서체 요약)")
AI Message: "오늘 TBM 요약을 정리했습니다. 내용을 확인하고 확정해 주세요."

{domain_block}

{domain_tools_block}
'''

# Legacy prompts for backwards compatibility
EHS_SYSTEM = get_system_prompt("ehs", "korean")
SYSTEM = get_system_prompt("tbm", "korean")

TOOLS_SCHEMA = [
    {
        "type": "function",
        "name": "display_cue",
        "description": "Display a short cue to the user to encourage the user to take initiative and lead the conversation. Use cues to derive the user's leadership, not to direct or command.",
        "parameters": {
            "type": "object",
            "properties": {
                "cue": {
                    "type": "string",
                    "description": "A short cue or prompt for the user to talk about."
                }
            },
            "required": ["cue"]
        }
    },
    {
        "type": "function",
        "name": "interrupt_for_safety",
        "description": "Interrupt the conversation when the user is skipping checklist items or not following safety procedures. Use this to enforce sequential completion of safety checklist items.",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {
                    "type": "string",
                    "description": "The reason for the interruption (e.g., 'skipping checklist items', 'safety procedure violation')."
                },
                "skipped_items": {
                    "type": "array",
                    "description": "Array of checklist item indices that were skipped.",
                    "items": {
                        "type": "integer"
                    }
                },
                "safety_message": {
                    "type": "string",
                    "description": "Helpful and cautious safety information to provide after the interruption."
                }
            },
            "required": ["reason", "safety_message"]
        }
    },
    {
        "type": "function",
        "name": "collect_prior_information",
        "description": "Collect prior information from the user. Call this function immediately after the user mentions at least one item of prior information.",
        "parameters": {
            "type": "object",
            "properties": {
                "work_location": {
                    "type": "string", 
                    "description": "Work location."
                },
                "work_content_details": {
                    "type": "string", 
                    "description": "Work content details."
                },
                "number_of_workers": {
                    "type": "integer", 
                    "description": "Number of workers."
                },
                "equipment_details": {
                    "type": "string",
                    "description": "Equipment details."
                }
            },
            "required": []
        }
    },
    {
        "type": "function",
        "name": "create_dynamic_checklist",
        "description": "Create a dynamic 5-item safety checklist based on the collected prior information. Call this function after all prior information has been collected.",
        "parameters": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "description": "Array of 5 safety checklist items customized for the specific work context.",
                    "items": {
                        "type": "string"
                    },
                    "minItems": 5,
                    "maxItems": 5
                }
            },
            "required": ["items"]
        }
    },
    {
        "type": "function",
        "name": "complete_checklist_item",
        "description": "Complete a single checklist item. Call this function when the user mentions a checklist item.",
        "parameters": {
            "type": "object",
            "properties": {
                "index": {
                    "type": "integer", 
                    "description": "1-based index of the checklist item that was completed."
                },
                "utterance": {
                    "type": "string",
                    "description": "The user's utterance on the checklist item. Keep the original language of the utterance."
                }
            },
            "required": ["index", "utterance"]
        }
    },
    {
        "type": "function",
        "name": "retrieve_documents",
        "description": "Retrieve relevant safety documents and guidelines based on keywords. Use this tool when you need specific safety information, regulations, or guidelines to provide better advice or create more accurate checklists.",
        "parameters": {
            "type": "object",
            "properties": {
                "keywords": {
                    "type": "array",
                    "description": "Array of keywords to search for relevant documents. Include work-related terms, safety topics, equipment names, work locations, and specific safety concerns. Include only keywords that are relevant to the work context. Include only one or two keywords.",
                    "items": {
                        "type": "string"
                    },
                    "minItems": 1
                }
            },
            "required": ["keywords"]
        }
    },
    {
        "type": "function",
        "name": "display_document_citations",
        "description": "Display relevant document citations to the user after retrieving and analyzing documents. Use this to show users where they can find additional detailed information.",
        "parameters": {
            "type": "object",
            "properties": {
                "citations": {
                    "type": "array",
                    "description": "Array of document citations to display to the user.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {
                                "type": "string",
                                "description": "Document title"
                            },
                            "url": {
                                "type": "string",
                                "description": "Document URL"
                            },
                            "summary": {
                                "type": "string",
                                "description": "Brief summary of why this document is relevant (2-3 sentences max)"
                            }
                        },
                        "required": ["title", "url", "summary"]
                    }
                },
                "context": {
                    "type": "string",
                    "description": "Brief context about why these documents are being cited (e.g., 'Related safety guidelines for high-altitude work')"
                }
            },
            "required": ["citations"]
        }
    },
    {
        "type": "function",
        "name": "update_session_field",
        "description": (
            "Update a single field of the structured 8-field TBM record as the conversation progresses. "
            "Call this every time the user provides information that maps to one of the fields, even partially. "
            "Pass exactly one of string_value, array_value, or boolean_value depending on the field type. "
            "This coexists with collect_prior_information and complete_checklist_item — use them together, not as replacements. "
            "Field types: work_summary=string, changes_today=string, hazards=string array, risk_scenarios=string array, "
            "mitigations=string array, ppe=string array, special_notes=string, attendance_confirmed=boolean."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "field": {
                    "type": "string",
                    "enum": [
                        "work_summary",
                        "changes_today",
                        "hazards",
                        "risk_scenarios",
                        "mitigations",
                        "ppe",
                        "special_notes",
                        "attendance_confirmed"
                    ],
                    "description": "Name of the structured field to update."
                },
                "string_value": {
                    "type": "string",
                    "description": "Value for string fields (work_summary, changes_today, special_notes)."
                },
                "array_value": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Value for array fields (hazards, risk_scenarios, mitigations, ppe). Each item is one short phrase."
                },
                "boolean_value": {
                    "type": "boolean",
                    "description": "Value for boolean fields (attendance_confirmed only)."
                },
                "mode": {
                    "type": "string",
                    "enum": ["replace", "append"],
                    "description": "For array fields only. 'append' adds new items; 'replace' overwrites. Defaults to 'append'."
                }
            },
            "required": ["field"]
        }
    },
    {
        "type": "function",
        "name": "suggest_hazards",
        "description": (
            "Propose 1-3 additional hazards the user may have missed, based on the current conversation context. "
            "Use when the user's hazards list feels thin, or when the work context implies common risks that weren't mentioned. "
            "Each suggestion is advisory — the user must confirm before it becomes part of the record. "
            "Do not repeat hazards already in the record."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "suggestions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "hazard": {
                                "type": "string",
                                "description": "Short name of the suggested hazard (one phrase)."
                            },
                            "rationale": {
                                "type": "string",
                                "description": "Why this hazard is worth checking, grounded in the user's context (one sentence)."
                            }
                        },
                        "required": ["hazard", "rationale"]
                    },
                    "minItems": 1,
                    "maxItems": 3
                }
            },
            "required": ["suggestions"]
        }
    },
    {
        "type": "function",
        "name": "finalize_tbm",
        "description": (
            "Generate a final document-style summary of the TBM and mark the session ready for user confirmation. "
            "Call this only after the 8 structured fields are reasonably filled AND the user signals they are done. "
            "The summary must be in field-report tone (not conversational) and must cover: today's work, any changes, "
            "identified hazards, risk scenarios, mitigations, PPE, special notes, and attendance status."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "final_summary": {
                    "type": "string",
                    "description": "Document-style summary suitable for a site record. Written in the user's language."
                }
            },
            "required": ["final_summary"]
        }
    }
]