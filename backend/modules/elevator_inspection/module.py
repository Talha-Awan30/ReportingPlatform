"""Elevator Inspection module.

Covers passenger and cargo lifts, escalators/travellators and dumbwaiters.

The form mirrors the two approved documents exactly:

  * "Title Page.docx"          -> `title_page` + `title_page_photos`, filled in
                                  ONCE per visit and shared by every elevator.
  * "Elevator Report Format.docx" -> `unit_details` (the particulars table),
                                  `sections` (the check-point tables),
                                  `conclusion` (findings + next examination) and
                                  `photo_slots` (the six-box photographic
                                  presentation), repeated FOR EACH elevator.

Checkpoints are referenced against ASME A17.1 / A17.2 / EN 81 (Safety Code for
Elevators and Escalators). Every dropdown reads its wording from a master list,
so approved phrasing is edited in Admin, not here.
"""
from modules.base import Checkpoint, ModuleSpec, PhotoSlot, Section

RESULT = "inspection_result"      # Satisfactory / Defect / Not Applicable
LOAD_RESULT = "load_test_result"  # Pass / Fail / Not Performed
CONCLUSION = "overall_result"     # Satisfactory / Unsatisfactory / Conditional


def _cp(key, label, **kw):
    """Shorthand: a standard result dropdown with a remarks field beside it."""
    return Checkpoint(key=key, label=label, kind="dropdown", options_key=RESULT, **kw)


def _text(key, label, **kw):
    return Checkpoint(key=key, label=label, kind="text", options_key="", **kw)


# ---------------------------------------------------------------------------
# TITLE PAGE - captured once per visit, shared by every elevator in the set.
# Fields and order taken straight from "Title Page.docx".
# ---------------------------------------------------------------------------
TITLE_PAGE = [
    _text("report_title", "Report title",
          default="Third Party Inspection of Passenger Elevator",
          help_text="Printed across the top of the cover page."),
    _text("client", "Client", help_text="Client name as it should appear on the cover."),
    _text("client_ref", "Client Ref", required=False,
          help_text='e.g. "Email Dated: 20th June, 2026"'),
    _text("client_contact_person", "Client Contact Person", required=False),
    _text("sgs_ref_no", "SGS Ref. No."),
    _text("inspected_by", "Inspected by",
          help_text='Name and designation, e.g. "Sumair Ahmed (Asst. Manager)"'),
    _text("site", "Site"),
    _text("equipment_identification", "Equipment Identification",
          help_text='e.g. "Passenger Lift"'),
    Checkpoint(key="survey_date", label="Survey Date", kind="date", options_key=""),
    _text("qr_code", "QR Code", required=False,
          help_text="Verification reference printed on the cover. Leave blank if not used."),
    _text("prepared_by_name", "Prepared by - name"),
    _text("prepared_by_designation", "Prepared by - designation"),
    _text("reviewed_by_name", "Reviewed by - name", required=False),
    _text("reviewed_by_designation", "Reviewed by - designation", required=False),
]

TITLE_PAGE_PHOTOS = [
    PhotoSlot("cover_photo", "Cover photograph", required=False,
              help_text="Main image on the title page. Shared by every elevator in this visit."),
    PhotoSlot("site_photo", "Site photograph", required=False,
              help_text="Optional second cover image."),
]

# ---------------------------------------------------------------------------
# PER-ELEVATOR PARTICULARS - the table that heads each elevator's report.
# From "Elevator Report Format.docx", table 2.
# ---------------------------------------------------------------------------
UNIT_DETAILS = [
    _text("name_of_client", "Name of Client"),
    _text("identification", "Identification",
          help_text="The elevator's tag or ID on site."),
    _text("make", "Make"),
    _text("model", "Model"),
    _text("manufacturer_serial_number", "Manufacturer Serial Number"),
    _text("capacity", "Capacity", help_text='e.g. "1000 kg"'),
    _text("location", "Location"),
    Checkpoint(key="inspection_date", label="Inspection Date", kind="date", options_key=""),
    Checkpoint(key="status", label="Status", kind="dropdown", options_key=CONCLUSION,
               help_text="Satisfactory or Unsatisfactory."),
    _text("type", "Type", required=False),
    Checkpoint(key="levels", label="Levels", kind="number", options_key="",
               help_text="Number of levels served."),
    _text("reference_code", "Reference Code For Inspection",
          default="ASME A-17.1 / A-17.2 / EN-81",
          help_text="Safety Code For Elevators and Escalators."),
]

# ---------------------------------------------------------------------------
# PHOTOGRAPHIC PRESENTATION - the fixed six boxes that close each report.
# From "Elevator Report Format.docx", table 14.
# ---------------------------------------------------------------------------
PHOTO_SLOTS = [
    PhotoSlot("cabin", "Cabin", required=True),
    PhotoSlot("machine_room", "Machine Room", required=True),
    PhotoSlot("pit_area", "Pit Area", required=True),
    PhotoSlot("shaft", "Shaft", required=True),
    PhotoSlot("car_top", "Car top", required=True),
    PhotoSlot("control_panel", "Control Panel", required=True),
]

# ---------------------------------------------------------------------------
# FINDINGS & CONCLUSION - closes each elevator's report.
# ---------------------------------------------------------------------------
CONCLUSION_FIELDS = [
    Checkpoint(key="major_findings", label="MAJOR FINDINGS", kind="textarea",
               options_key="", required=False),
    Checkpoint(key="minor_findings", label="MINOR FINDINGS (Area of Improvement)",
               kind="textarea", options_key="", required=False),
    Checkpoint(key="next_examination_due", label="Next Examination Due on", kind="date",
               options_key="",
               help_text="Six months after a satisfactory inspection; not applicable if unsatisfactory."),
    Checkpoint(key="conclusion", label="Conclusion", kind="dropdown", options_key=CONCLUSION,
               help_text="The closing statement printed on the report."),
    _text("inspector_signature_name", "Inspected by - name on the signature block",
          required=False),
]


MODULE = ModuleSpec(
    slug="elevator_inspection",
    name="Elevator Inspection",
    summary="Passenger and cargo lifts, escalators and dumbwaiters - visual examination, function and load test.",
    icon="fa-elevator",
    report_prefix="ELV",
    default_validity_months=6,
    docx_template="elevator_inspection_report_template.docx",
    equipment_types=[
        'Passenger / Cargo Lift',
        'Escalator / Travellator',
        'Dumbwaiter',
    ],
    order=30,

    # One visit can cover several elevators: shared title page, checklist per unit.
    supports_multiple=True,
    unit_noun="elevator",
    unit_noun_plural="elevators",
    max_units=20,

    title_page=TITLE_PAGE,
    title_page_photos=TITLE_PAGE_PHOTOS,
    unit_details=UNIT_DETAILS,
    photo_slots=PHOTO_SLOTS,
    conclusion=CONCLUSION_FIELDS,

    sections=[
        Section(
            key="alarm_bell",
            title="Alarm Bell & Emergency Telephone",
            checkpoints=[
                _cp("alarm_operation", "Alarm operation", allows_photos=True),
                _cp("response_system", "Response system"),
            ],
        ),
        Section(
            key="safety_edge",
            title="Safety Edge, Sensors & Car",
            checkpoints=[
                _cp("safety_edges", "Condition and operation of the safety edges and door sensors"),
                _cp("door_pressure", "Door closing pressure appropriate for the environment"),
                _cp("load_marking", "Maximum allowable load capacity marked at each floor"),
                _cp("floor_levelling", "Floor levelling in both the up and down direction"),
                _cp("push_buttons", "Push buttons undamaged, covers present, no sharp edges"),
                _cp("cop_lop", "Operation of cabin operating panel and landing operating panel"),
                _cp("fire_switch", "Condition and operation of the fire safety switch"),
                _cp("seismic_device", "Condition and operation of the seismic device"),
                _cp("overload_device", "Condition and operation of the overload protection device"),
            ],
        ),
        Section(
            key="car_doors",
            title="Car Doors / Gates",
            checkpoints=[
                _cp("door_wear", "Adjustment and wear; gaps between sliding doors and architrave"),
                _cp("sill_tracks", "Wear in door sill tracks and door shoes"),
                _cp("multileaf_gap", "Gap between multi-leaf doors at bottom when closed"),
                _cp("vision_panel_car", "Vision panel in solid doors is the wired glass type"),
            ],
        ),
        Section(
            key="motor_room",
            title="Motor & Pulley Rooms",
            checkpoints=[
                _cp("door_locked", "Door locked and prescribed hazard warning notice fitted"),
                _cp("key_custody", "Motor room key held by a responsible person, or notice provided"),
                _cp("access_route", "Access route safe and free from obstructions"),
                _cp("ventilation", "Ventilation or air conditioning maintains ambient temperature"),
                _cp("fire_protection", "Fire extinguisher and lighting system available"),
                _cp("cleanliness", "Adequately lit, clean and tidy"),
                _cp("equipment_siting", "Controller, traction unit, governor and selector safely sited"),
                _cp("guarding", "Appropriate guarding and hazard markings where a hazard may result"),
                _cp("notices", "Hand winding instructions and electric shock treatment displayed"),
                _cp("log_book", "Maintenance log book in order, properly compiled and up to date"),
            ],
        ),
        Section(
            key="control_panels",
            title="Control Panels & Electrical Equipment",
            checkpoints=[
                _cp("housing", "All electrical equipment suitably housed"),
                _cp("isolation_switch", "Main isolation switch readily accessible at the room door"),
                _cp("controller_interior", "Wiring, arc splash guards, breaker labelling and fuse ratings"),
                _cp("no_flammables", "No flammable papers or materials in or on the controller"),
                _cp("ard_operation", "Operation of the Automatic Rescue Device (ARD)"),
            ],
        ),
        Section(
            key="traction_unit",
            title="Traction Unit",
            checkpoints=[
                _cp("component_condition", "Split pins, grub screws, brake shoes and drums secure"),
                _cp("gear_oil", "Gear oil level indicator checked"),
                _cp("suspension_rope", "Condition of the suspension rope over its full length"),
                _cp("pulleys", "Condition of traction pulley and cabin / counterweight pulley"),
                _cp("emergency_release", "Emergency release fitted or available"),
            ],
        ),
        Section(
            key="car_top",
            title="Car Top & Well Enclosure",
            checkpoints=[
                _cp("car_top_access", "Safe access to car top; emergency stop operated without delay"),
                _cp("car_top_condition", "Car top free of loose wiring, spilt oil and trip hazards"),
                _cp("maintenance_limit", "Operation of the maintenance limit"),
                _cp("limit_clearance", "Limit stops car 1.8 m below well ceiling or nearest obstruction"),
                _cp("headroom_notice", "Restricted headroom notices present where appropriate"),
                _cp("up_ultimate_limit", "An up ultimate limit is provided"),
                _cp("enclosure_complete", "Lift well enclosure complete with no loose panels"),
                _cp("other_services", "Other services in the well are safe and adequately fixed"),
                _cp("guide_brackets", "Fixing bolts on car and balance weight guide brackets tight"),
                _cp("guide_alignment", "Car guide alignment"),
                _cp("suspension_belts", "Condition of suspension belts over entire length"),
                _cp("balance_weight", "Balance weight and attachments clear of the well wall"),
                _cp("tie_rods", "Tie rod lock nuts and split pins secure"),
                _cp("rope_terminations", "Suspension rope, compensatory belt and idle rope terminations"),
                _cp("trailing_flexes", "Trailing flexes free from abrasion and snagging damage"),
                _cp("bottom_limit", "Car drives down onto the bottom maintenance stopping limit"),
                _cp("buffer_clearance", "Car does not contact pit buffers when it stops"),
            ],
        ),
        Section(
            key="landing_doors",
            title="Landing Doors",
            checkpoints=[
                _cp("locks_fixed", "Locks securely fixed and lock covers fitted"),
                _cp("pre_locking", "Power operated doors incorporate the pre-locking feature"),
                _cp("emergency_release_lock", "Emergency lock release mechanism working"),
                _cp("escutcheon", "Landing door emergency release escutcheon plates satisfactory"),
                _cp("multileaf_linkage", "Mechanical linkage or slave contacts on multi-leaf systems"),
                _cp("closer_cords", "Door closer cords free of broken wires and cut fibres"),
                _cp("door_stops", "Condition of door stops and buffers"),
                _cp("header_adjustment", "Headers and eccentric rollers adjusted; forced gap under 10 mm"),
                _cp("track_fixing", "Top and bottom tracks and door frames securely fixed"),
                _cp("toe_guards", "Toe guards present and appropriate to the door opening operation"),
                _cp("door_shoes", "Landing and car door shoes securely fixed and free of corrosion"),
                _cp("vision_panel_landing", "Vision panels in solid landing doors are wired glass"),
            ],
        ),
        Section(
            key="lift_pit",
            title="Lift Well Pit",
            checkpoints=[
                _cp("pit_access", "Safe means of access to the pit from the bottom landing"),
                _cp("pit_condition", "Pit safe, clean and free of flammable rubbish"),
                _cp("pit_depth", "Pit depth provides survival space under a compressed buffer"),
                _cp("pit_stop_switch", "Pit stop switch fitted and correctly positioned"),
                _cp("pit_equipment", "Pit mounted equipment undamaged by water ingress or flooding"),
                _cp("weight_guard", "Balance weight guard fixings secure"),
                _cp("buffers", "Car and balance weight buffers securely fixed and correctly positioned"),
                _cp("rope_weight_switches", "Adjustment of broken rope / idle rope weight switches"),
                _cp("runby_clearance", "Balance weight run-by clearance with the car at top landing"),
                _cp("under_car", "All attachments underneath the lift car"),
                _cp("safety_gear_type", "Safety gear type appropriate for the type of lift"),
                _cp("safety_gear_linkage", "Free movement of safety gear linkages by hand"),
                _cp("car_apron", "Underside of lift car provided with an adequate car apron"),
            ],
        ),
        Section(
            key="load_test",
            title="Load Test Exercise",
            description="Calibrated test weights, run bottom to top and back with stops at every floor.",
            checkpoints=[
                Checkpoint(
                    key="rated_capacity_test",
                    label="10.1 Rated capacity load test (100%)",
                    kind="dropdown",
                    options_key=LOAD_RESULT,
                    help_text="Brake performance, levelling accuracy, abnormal noise and vibration.",
                    allows_photos=True,
                ),
                Checkpoint(
                    key="proof_load_test",
                    label="10.2 Proof load test (110%)",
                    kind="dropdown",
                    options_key=LOAD_RESULT,
                    help_text="Brake performance, levelling accuracy, abnormal noise and vibration.",
                    allows_photos=True,
                ),
                Checkpoint(
                    key="brake_performance_test",
                    label="10.3 Brake performance test (125%)",
                    kind="dropdown",
                    options_key=LOAD_RESULT,
                    help_text="Load held 8-10 minutes; the car must not move, slip or change level.",
                    allows_photos=True,
                ),
                Checkpoint(
                    key="test_weights_used",
                    label="Calibrated test weights used",
                    kind="text",
                    required=False,
                ),
            ],
        ),
        Section(
            key="findings",
            title="Findings & Conclusion",
            description="Free-text observations that carry straight into the Word report.",
            checkpoints=[
                Checkpoint(key="major_findings", label="Major findings", kind="textarea", required=False),
                Checkpoint(
                    key="minor_findings",
                    label="Minor findings (area of improvement)",
                    kind="textarea",
                    required=False,
                ),
                Checkpoint(
                    key="reference_code",
                    label="Reference code for inspection",
                    kind="text",
                    required=False,
                    default="ASME A17.1 / A17.2 / EN-81",
                ),
                Checkpoint(key="levels", label="Number of levels served", kind="number", required=False),
            ],
        ),
    ],
)
