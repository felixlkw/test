"""Tenant configuration for multi-PoC deployment.

Each PoC (customer-facing demo) is a TenantConfig: company name, app name,
domain label overrides, hidden domains, and (Phase ③) EHS recommended question
seeds. The active tenant is selected via the TENANT_ID environment variable.

To add a new customer PoC:
1. Add a new TenantConfig instance below.
2. Register it in TENANTS.
3. Set TENANT_ID=<id> in the Railway service for that customer.

The backend domain keys (manufacturing/construction/heavy_industry/semiconductor)
are kept stable across tenants so IndexedDB session data and the request/response
contracts remain compatible. Only the user-facing labels and content vary.
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
    # prompt.py for matching keys). Keep paragraphs short — they consume
    # prompt tokens on every TBM/EHS session that opts into a domain.
    domain_context_overlay: dict[str, str] = field(default_factory=dict)
    # per-domain EHS recommended question seeds (frontend consumes via mirror).
    ehs_recommended_questions: dict[str, list[str]] = field(default_factory=dict)


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


LG_INNOTEK = TenantConfig(
    id="lg_innotek",
    company_name="LG이노텍",
    app_name="Safety Vision",
    domain_labels={
        "manufacturing": "생산",
        "construction": "건설",
        "heavy_industry": "설비관리",
        "semiconductor": "반도체",
    },
    hidden_domains=frozenset({"semiconductor"}),
    domain_context_overlay={
        "manufacturing": (
            "Domain: LG Innotek production lines — optics modules (smartphone "
            "camera modules, 3D sensing, automotive cameras, XR), package "
            "substrates (FC-BGA, Tape Substrate, photomasks, OLED metal masks), "
            "and mobility components (5G/V2X comm modules, LiDAR/camera/radar "
            "sensors, EV power modules/inverters). Priority hazards: cleanroom "
            "chemical exposure (IPA solvents, plating bath acids, photoresist "
            "PGMEA), optical hazards (UV-cure light sources, Class 3B/3R AOI/"
            "LiDAR lasers, femtosecond laser mask fabrication), automation "
            "pinch (pick-and-place mounters, screen printers, AGV-worker "
            "crossings), solder reflow fumes, high-voltage EV DC-link residual "
            "charge. Typical permits: HOT_WORK, LOTO, LASER, ELECTRICAL, "
            "CHEMICAL_LINE_BREAK. Collect prior info including line_id, shift, "
            "contractor_mix, ESD-zone status, and any new material or process "
            "change today."
        ),
        "heavy_industry": (
            "Domain: LG Innotek equipment PM/MRO (presented to the user as "
            "'설비관리', equipment maintenance). Scope: cleanroom tool PM "
            "(photo/etch/CVD/plating), photolithography stepper/aligner "
            "maintenance, plating bath and chemical line PM, special-gas "
            "cabinet inspection, optical inspection (AOI/AVI) calibration, "
            "FFU filter replacement, UPW/DI water and scrubber service. "
            "Priority hazards: residual energy (RF generator, DC rectifiers "
            ">500A, 380V FFU, residual vacuum, compressed air, residual "
            "chemical), chemical exposure (HF, TMAH, sulfuric/phosphoric acid, "
            "cyanide plating bath), special-gas leaks (SiH4 pyrophoric, AsH3 "
            "TLV 0.005 ppm, PH3, NH3), confined space inside chambers, fall "
            "hazard during ceiling FFU work, optical radiation from UV/excimer/"
            "laser sources. Typical permits: LOTO, CHEMICAL_LINE_BREAK, "
            "CONFINED_SPACE, HOT_WORK, LASER, ELECTRICAL. Quantitative "
            "measurements (ppm, %LEL, O2%, residual voltage, differential "
            "pressure) are mandatory before/during/after PM — call "
            "log_measurement whenever the user reports a number."
        ),
        "construction": (
            "Domain: LG Innotek fab/line extension and cleanroom fitout — new "
            "fab structure and exterior, cleanroom panel/FFU install, large "
            "equipment rigging (5–50 t lithography/etch/plating tools), "
            "special gas piping (SiH4, NH3, Cl2), chemical/UPW line install, "
            "MEP-HVAC, raised-floor and epoxy-floor work. Priority hazards: "
            "falls from height (FFU install, ceiling grid), crane loads (heavy "
            "semi-equipment rigging), excavation collapse, confined space "
            "(epoxy enclosure, gas-cabinet interior), hot work near gas/"
            "chemical lines, residual pressure in pressurized lines during "
            "commissioning, and adjacent live-line protection failure that "
            "risks fab yield. Typical permits: WORKING_AT_HEIGHT, LIFTING, "
            "CONFINED_SPACE, HOT_WORK, EXCAVATION, CHEMICAL_LINE_BREAK. "
            "Weather gates: wind >=10 m/s caution, >=15 m/s stop rigging; "
            "thunderstorm or heavy rain suspends rooftop and outdoor work."
        ),
    },
)


TENANTS: dict[str, TenantConfig] = {
    DEFAULT.id: DEFAULT,
    LG_INNOTEK.id: LG_INNOTEK,
}


def get_active_tenant() -> TenantConfig:
    tid = os.getenv("TENANT_ID", DEFAULT.id)
    return TENANTS.get(tid, DEFAULT)
