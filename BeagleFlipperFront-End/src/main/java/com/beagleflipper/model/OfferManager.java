package com.beagleflipper.model;

import javax.inject.Inject;
import javax.inject.Singleton;
import lombok.extern.slf4j.Slf4j;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Singleton
public class OfferManager {

    private final Map<Long, Map<Integer, SavedOffer>> accountHashToOffers = new HashMap<>();

    private int lastViewedSlotItemId = -1;
    private int lastViewedSlotItemPrice = -1;
    private int lastViewedSlotPriceTime = 0;
    private boolean offerJustPlaced = false;

    @Inject
    public OfferManager() {}

    public void saveOffer(Long accountHash, int slot, SavedOffer offer) {
        accountHashToOffers.computeIfAbsent(accountHash, k -> new HashMap<>()).put(slot, offer);
    }

    public SavedOffer loadOffer(Long accountHash, int slot) {
        return accountHashToOffers.getOrDefault(accountHash, Collections.emptyMap()).get(slot);
    }

    public void saveAll() {
        log.debug("Saving all offers");
    }

    public Collection<SavedOffer> getOffers() {
        Collection<SavedOffer> allOffers = new ArrayList<>();
        accountHashToOffers.values().forEach(map -> allOffers.addAll(map.values()));
        return allOffers;
    }

    // Getters
    public boolean isOfferJustPlaced() { return offerJustPlaced; }
    public int getViewedSlotItemId() { return lastViewedSlotItemId; }
    public int getViewedSlotItemPrice() { return lastViewedSlotItemPrice; }
    public int getLastViewedSlotPriceTime() { return lastViewedSlotPriceTime; }

    // Setters
    public void setOfferJustPlaced(boolean offerJustPlaced) { this.offerJustPlaced = offerJustPlaced; }

    // FIX: Added all missing setters that OfferHandler requires
    public void setViewedSlotItemId(int itemId) { this.lastViewedSlotItemId = itemId; }
    public void setViewedSlotItemPrice(int price) { this.lastViewedSlotItemPrice = price; }
    public void setLastViewedSlotItemId(int itemId) { this.lastViewedSlotItemId = itemId; }
    public void setLastViewedSlotItemPrice(int price) { this.lastViewedSlotItemPrice = price; }
    public void setLastViewedSlotPriceTime(int time) { this.lastViewedSlotPriceTime = time; }
}