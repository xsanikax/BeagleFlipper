package com.beagleflipper.model;

import lombok.RequiredArgsConstructor;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.*;
import javax.inject.Inject;
import javax.inject.Singleton;
import java.util.List;
import java.util.Map;

@Slf4j
@Singleton
@RequiredArgsConstructor(onConstructor_ = @Inject)
public class AccountStatusManager {

    private final Client client;
    private final OsrsLoginManager osrsLoginManager;
    private final GrandExchangeUncollectedManager geUncollected;
    private final SuggestionPreferencesManager suggestionPreferencesManager;
    private final PausedManager pausedManager;

    @Setter
    private int skipSuggestion = -1;

    public synchronized AccountStatus getAccountStatus() {
        Long accountHash = osrsLoginManager.getAccountHash();
        // FIX: Use InventoryID.INVENTORY.getId() to get the container ID
        ItemContainer itemContainer = client.getItemContainer(InventoryID.INVENTORY);

        if (itemContainer == null) {
            log.warn("unable to fetch inventory item container");
            return null;
        }
        Inventory inventory = Inventory.fromRunelite(itemContainer, client);
        Map<Integer, Long> u = geUncollected.loadAllUncollected(accountHash);

        GrandExchangeOffer[] geOffers = client.getGrandExchangeOffers();
        StatusOfferList offerList = StatusOfferList.fromRunelite(geOffers);

        AccountStatus status = new AccountStatus();
        status.setOffers(offerList);
        status.setInventory(inventory);
        status.setUncollected(u);
        status.setDisplayName(osrsLoginManager.getPlayerDisplayName());
        status.setAccountHash(accountHash);
        status.setSuggestionSkipped(isSuggestionSkipped());
        status.setSellOnlyMode(suggestionPreferencesManager.getPreferences().isSellOnlyMode());
        status.setF2pOnlyMode(suggestionPreferencesManager.getPreferences().isF2pOnlyMode());
        status.setMember(osrsLoginManager.isMembersWorld());
        status.setSuggestionsPaused(pausedManager.isPaused());
        status.setBlockedItems(suggestionPreferencesManager.blockedItems());
        status.setTimeframe(suggestionPreferencesManager.getTimeframe());

        // This logic appears correct from your upload
        Map<Integer, Long> inLimboItems = geUncollected.getLastClearedUncollected();
        List<Integer> clearedSlots = geUncollected.getLastClearedSlots();
        if (geUncollected.getLastClearedTick() == client.getTickCount()) {
            if (inventory.missingJustCollected(inLimboItems)) {
                inLimboItems.forEach((itemId, qty) -> {
                    if (qty > 0) {
                        inventory.mergeItem(new RSItem(itemId, qty));
                    }
                });
            }
            for (Integer slot : clearedSlots) {
                Offer o = offerList.get(slot);
                GrandExchangeOffer geOffer = geOffers[slot];
                if (!isActive(geOffer.getState()) && geOffer.getState() != GrandExchangeOfferState.EMPTY) {
                    o.setStatus(OfferStatus.EMPTY);
                }
            }
        }

        return status;
    }

    private boolean isActive(GrandExchangeOfferState state) {
        switch (state) {
            case EMPTY:
            case CANCELLED_BUY:
            case CANCELLED_SELL:
            case BOUGHT:
            case SOLD:
                return false;
            default:
                return true;
        }
    }

    public boolean isSuggestionSkipped() {
        return skipSuggestion != -1;
    }

    public void resetSkipSuggestion() {
        skipSuggestion = -1;
    }

    public void reset() {
        skipSuggestion = -1;
    }
}