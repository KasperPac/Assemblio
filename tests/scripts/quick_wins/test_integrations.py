from scripts.quick_wins.integrations import COMPETITOR_MATRIX, INTEGRATIONS

EXPECTED_COMPETITORS = {"Katana", "Cin7 Core", "MRPeasy", "Craftybase", "inFlow", "Manuva"}
VALID_STATUSES = {"shipped", "in_progress", "planned", "partner"}
VALID_CELLS = {"Native", "Via Extensiv", "Zapier only", "None",
               "Shipped", "Wave 1", "Wave 2", "Wave 3", "Partner"}


def test_integrations_has_ten_entries():
    assert len(INTEGRATIONS) == 10


def test_all_integrations_have_required_fields():
    required = {"name", "wave", "status", "data_flows", "gotcha"}
    for integ in INTEGRATIONS:
        missing = required - integ.keys()
        assert not missing, f"{integ.get('name')} missing: {missing}"


def test_integration_statuses_are_valid():
    for integ in INTEGRATIONS:
        assert integ["status"] in VALID_STATUSES, (
            f"{integ['name']} has invalid status '{integ['status']}'"
        )


def test_all_data_flows_are_non_empty_lists():
    for integ in INTEGRATIONS:
        assert isinstance(integ["data_flows"], list), f"{integ['name']} data_flows not a list"
        assert len(integ["data_flows"]) >= 1, f"{integ['name']} has no data flows"


def test_competitor_matrix_covers_all_integrations():
    integ_names = {i["name"] for i in INTEGRATIONS}
    assert set(COMPETITOR_MATRIX.keys()) == integ_names


def test_competitor_matrix_has_correct_competitors_per_row():
    for integ_name, competitors in COMPETITOR_MATRIX.items():
        assert set(competitors.keys()) == EXPECTED_COMPETITORS, (
            f"{integ_name} has wrong competitor keys"
        )
