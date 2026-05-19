import pytest

from scripts.quick_wins.mapping import classify_workstream, match_segments


@pytest.mark.parametrize("text,expected", [
    ("Ship Xero OAuth + connection screen.", "Build"),
    ("Build Craftybase CSV import wizard v1.", "Build"),
    ("Publish Charter Partner Program landing page.", "Build"),
    ("Send 30 personalised Charter invites.", "Sell"),
    ("Run 8-12 Charter discovery calls.", "Sell"),
    ("Post in 'Australian candle makers' FB group: a value-first post.", "Content"),
    ("Publish pillar post #1: 'Outgrowing Craftybase'.", "Content"),
    ("Run first bi-weekly cadence calls with all 5 Charter Partners.", "Support"),
    ("Onboard 1 Charter Partner via the wizard as a dogfood test.", "Support"),
])
def test_classify_workstream(text, expected):
    assert classify_workstream(text) == expected


def test_match_segments_candle_and_soap():
    text = "Send 12 candle/soap makers from the 'Australian Soapmakers' Facebook group."
    assert "04_candle_soap_homefragrance" in match_segments(text)


def test_match_segments_katana_defectors():
    text = "Build Katana real-cost calculator embedded on /compare."
    assert "16_katana_defectors" in match_segments(text)


def test_match_segments_craftybase():
    text = "Publish pillar post #1: 'Outgrowing Craftybase' for AU candle and soap makers."
    matches = match_segments(text)
    assert "17_craftybase_graduates" in matches
    assert "04_candle_soap_homefragrance" in matches


def test_match_segments_no_keyword_returns_empty():
    text = "Ship Xero OAuth + connection screen."
    assert match_segments(text) == []
