"""Tenant configuration — Hoban Group SafeMate (single-tenant branch).

This branch (client/hoban-safemate) is dedicated to the Hoban Group's two
priority subsidiaries:

  • 호반건설 (Hoban E&C) — apartments (호반써밋·베르디움), mixed-use, civil SOC,
    resort/hotel construction.
  • 대한전선 (Taihan Cable & Solution) — cable manufacturing (안양·당진·베트남
    공장) and EPC (지중·가공·해저 포설, 변전소 시공).

Other Hoban subsidiaries (호반산업 토목, 호반호텔앤리조트 시설, 대한조선)
are out of primary scope and folded into the construction domain where
relevant.

Backend domain keys (manufacturing/construction/heavy_industry/semiconductor)
are kept stable to preserve IndexedDB/contract compatibility, but
heavy_industry and semiconductor are hidden from the Hoban UI. The
user-facing label of `manufacturing` is overridden to '케이블 제조' to
reflect the cable-factory focus.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class TenantConfig:
    id: str
    company_name: str
    app_name: str
    # backend domain key → user-facing label
    domain_labels: dict[str, str] = field(default_factory=dict)
    # backend domain keys to hide from the user-facing UI (still valid server-side)
    hidden_domains: frozenset[str] = field(default_factory=frozenset)
    # per-domain DOMAIN_CONTEXT overlay (replaces the default paragraph in
    # prompt.py for matching keys). Short — these consume prompt tokens every
    # TBM/EHS session that opts into a domain.
    domain_context_overlay: dict[str, str] = field(default_factory=dict)
    # per-domain EHS recommended question seeds (frontend consumes via mirror).
    ehs_recommended_questions: dict[str, list[str]] = field(default_factory=dict)
    # Phase 0.6 Wave 4 — domains where free-form (custom_work) entry is BLOCKED;
    # only catalog selection is permitted. Used for plants where SOP rigidity
    # matters more than conversational flow (대한전선 케이블 제조 인터록 우회 위험).
    catalog_forced_domains: frozenset[str] = field(default_factory=frozenset)


DEFAULT = TenantConfig(
    id="default",
    company_name="Samsung",
    app_name="SafeMate",
    domain_labels={
        "manufacturing": "제조",
        "construction": "건설",
        "heavy_industry": "중공업",
        "semiconductor": "반도체",
    },
    hidden_domains=frozenset(),
)


HOBAN = TenantConfig(
    id="hoban",
    company_name="호반그룹",
    app_name="호반 세이프",
    domain_labels={
        # 호반그룹 두 축: 호반건설(건설) + 대한전선(케이블 제조 + EPC 시공).
        # 'manufacturing' 키를 대한전선 케이블 공장 의미로 재용도. label 로 명시.
        "manufacturing": "케이블 제조",
        "construction": "건설",
        # 아래 두 도메인은 UI에서 숨김 — 호반의 우선순위에서 제외.
        "heavy_industry": "중공업",
        "semiconductor": "반도체",
    },
    hidden_domains=frozenset({"heavy_industry", "semiconductor"}),
    # 대한전선 케이블 제조는 정형 SOP 의존성 높음 (인터록 우회 사고 비중 큼) —
    # 자유 발화로 "인터록 건너뛰고 진행" 의 위험을 차단하기 위해 카탈로그 강제.
    catalog_forced_domains=frozenset({"manufacturing"}),
    domain_context_overlay={
        "construction": (
            "Domain: Hoban Group construction — combines 호반건설 (high-rise "
            "residential under HOBAN SUMMIT premium and Verdium mid-tier "
            "brands, mixed-use, urban district development), 호반산업 (civil "
            "SOC — toll road, tunnel, bridge), 호반호텔앤리조트 (resort/hotel "
            "extensions, 리솜리조트, 호반파크CC), and 대한전선 EPC "
            "(underground/overhead cable laying, substation construction, "
            "submarine cable laying). Priority hazards: falls from height "
            "(갱폼·시스템동바리·외부비계), tower-crane lifting (apartment "
            "clusters with multiple T/Cs), excavation collapse (지하주차장·"
            "흙막이), formwork/shoring buckling, mixed-contractor congestion, "
            "and cable-EPC specific risks: manhole confined space (지중 "
            "케이블 풀링), live-line proximity during overhead work, "
            "pulling-tension cable whip, and submarine cable barge handling. "
            "Typical permits: WORKING_AT_HEIGHT, LIFTING, EXCAVATION, "
            "HOT_WORK, CONFINED_SPACE, ELECTRICAL. Foreign-worker ratio in "
            "formwork/rebar/plastering and cable-pulling crews commonly 50%+ "
            "(Vietnamese / Thai / Chinese / Uzbek) — multilingual TBM and "
            "pictogram-first SOPs are non-negotiable. Weather gates: wind "
            "≥10 m/s suspend tower-crane lift, ≥15 m/s stop all lifting; "
            "rain ≥3 mm/h suspend excavation; lightning suspends rooftop, "
            "crane, and overhead-line work. Collect site_id, building/phase "
            "or cable route, shift, contractor mix, and any new subcontractor "
            "or live-line section today."
        ),
        "manufacturing": (
            "Domain: 대한전선 (Taihan Cable & Solution) cable manufacturing — "
            "Hoban Group's electrical infrastructure subsidiary acquired in "
            "2021. Plants: 안양 (R&D, HV/EHV test lab), 당진 (EHV power "
            "cable, submarine cable vertical extrusion), 베트남 (copper rod "
            "casting, MV/LV cable). Process flow: 동조괴 연속주조 (continuous "
            "copper-rod casting at 1100°C+) → 도체 연신 (conductor drawing) → "
            "XLPE 절연 압출 (cross-linked PE extrusion at 200°C+, crosslinking "
            "gas) → 시즈·연합 (lead/aluminum sheathing) → 차폐 편조 (shield "
            "braiding) → 권취·재단 (drum winding, drums to 50 t) → HV 시험 "
            "(partial-discharge and 250 kV+ AC withstand test). Priority "
            "hazards: molten-metal splash and steam explosion at casting, "
            "winding-nip pinch and conductor-whip at drawing/braiding, "
            "polymer fume and crosslinking-gas exposure at extrusion, lead "
            "fume at sheathing, drum tip-over during handling, residual-"
            "charge electrocution and arc flash at HV test, and confined-"
            "space risk inside large drum/spool storage. Typical permits: "
            "HOT_WORK, LOTO, ELECTRICAL (HV test), CONFINED_SPACE, "
            "CHEMICAL_LINE_BREAK. Quantitative checks: residual voltage <30V "
            "after capacitor discharge (5× RC time constant), lead-fume "
            "TLV 0.05 mg/m³, %LEL <10 in extrusion enclosures, O₂ 18.0–"
            "23.5% in drum-storage confined spaces. Foreign-worker ratio at "
            "베트남 공장 is the local workforce; 안양·당진 plants have a "
            "significant foreign-worker presence in casting and drawing — "
            "multilingual SOPs and standardized hand-signs are critical for "
            "LOTO/검전/단락접지 verification."
        ),
    },
)


TENANTS: dict[str, TenantConfig] = {
    DEFAULT.id: DEFAULT,
    HOBAN.id: HOBAN,
}


def get_active_tenant() -> TenantConfig:
    tid = os.getenv("TENANT_ID", HOBAN.id)
    return TENANTS.get(tid, HOBAN)
