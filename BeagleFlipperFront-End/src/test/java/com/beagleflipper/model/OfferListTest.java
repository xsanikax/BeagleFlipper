package com.beagleflipper.model;

import org.junit.Test;
import java.util.HashMap; // FIX: Add this required import

public class OfferListTest {
    @Test
    public void testIsEmptySlotNeededWithExistingOfferInSlot() {
        StatusOfferList offerList = new StatusOfferList();
        // FIX: The 8th argument is now a new HashMap<>() to match the updated Offer constructor
        offerList.set(0, new Offer(OfferStatus.BUY, 565, 200, 10, 0, 0, 0, new HashMap<>(), 0, false, false));
        Suggestion suggestion = new Suggestion("buy", 0, 560, 200, 10, "Death rune", 0, "", null);
        assert !offerList.isEmptySlotNeeded(suggestion);
    }

    @Test
    public void testIsEmptySlotNeededWithNoEmptySlots() {
        StatusOfferList offerList = new StatusOfferList();
        // FIX: The 8th argument is now a new HashMap<>() to match the updated Offer constructor
        offerList.replaceAll(ignored -> new Offer(OfferStatus.BUY, 565, 200, 10, 0, 0, 0, new HashMap<>(), 0, false, false));
        Suggestion suggestion = new Suggestion("buy", 0, 560, 200, 10, "Death rune", 0, "", null);
        assert offerList.isEmptySlotNeeded(suggestion);
    }
}