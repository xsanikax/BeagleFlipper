package com.beagleflipper.controller;

import com.beagleflipper.model.Suggestion;
import org.junit.Test;

public class TestSuggestionController {

    @Test
    public void testShouldNotifyOnWait() {
        Suggestion oldSuggestion = new Suggestion("wait", 0, 0, 0, 0, "", 0, "", null);
        Suggestion newSuggestion = new Suggestion("wait", 0, 0, 0, 0, "", 1, "", null);
        assert !SuggestionController.shouldNotify(newSuggestion, oldSuggestion);
    }

    @Test
    public void testShouldNotifyOnNewBuy() {
        Suggestion oldSuggestion = new Suggestion("wait", 0, 0, 0, 0, "", 0, "", null);
        Suggestion newSuggestion = new Suggestion("buy", 0, 560, 200, 25000, "Death rune", 1, "", null);
        assert SuggestionController.shouldNotify(newSuggestion, oldSuggestion);
    }

    @Test
    public void testShouldNotifyOnRepeatedBuy() {
        Suggestion oldSuggestion = new Suggestion("buy", 0, 560, 200, 25000, "Death rune", 0, "", null);;
        Suggestion newSuggestion = new Suggestion("buy", 0, 560, 200, 25000, "Death rune", 1, "", null);
        assert !SuggestionController.shouldNotify(newSuggestion, oldSuggestion);
    }

    @Test
    public void testShouldNotifyOnAbort() {
        Suggestion oldSuggestion = new Suggestion("wait", 0, 0, 0, 0, "", 0, "", null);
        Suggestion newSuggestion = new Suggestion("abort", 0, 560, 200, 25000, "Death rune", 1, "", null);
        assert SuggestionController.shouldNotify(newSuggestion, oldSuggestion);
    }
}
