package com.beagleflipper.controller;

import com.beagleflipper.model.*;
import com.beagleflipper.ui.GpDropOverlay;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentLinkedQueue;
import javax.inject.Inject;
import javax.inject.Singleton;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.*;
import net.runelite.api.events.GrandExchangeOfferChanged;
import net.runelite.client.callback.ClientThread;
import net.runelite.client.game.ItemManager;
import net.runelite.client.ui.overlay.OverlayManager;
import static com.beagleflipper.model.OsrsLoginManager.GE_LOGIN_BURST_WINDOW;

@Slf4j
@Singleton
@RequiredArgsConstructor(onConstructor_ = @Inject)
public class GrandExchangeOfferEventHandler {

    private final Client client;
    private final OfferManager offerManager;
    private final GrandExchange grandExchange;
    private final TransactionManger transactionManager;
    private final OsrsLoginManager osrsLoginManager;
    private final OverlayManager overlayManager;
    private final GrandExchangeUncollectedManager grandExchangeUncollectedManager;
    private final SuggestionManager suggestionManager;
    private final ItemManager itemManager;
    private final ClientThread clientThread;

    private final Queue<Transaction> transactionsToProcess = new ConcurrentLinkedQueue<>();

    public void onGameTick() {
        if (!transactionsToProcess.isEmpty()) {
            processTransactions();
        }
    }

    public void onGrandExchangeOfferChanged(GrandExchangeOfferChanged offerEvent) {
        final int slot = offerEvent.getSlot();
        final GrandExchangeOffer offer = offerEvent.getOffer();
        Long accountHash = client.getAccountHash();

        if (offer.getState() == GrandExchangeOfferState.EMPTY && client.getGameState() != GameState.LOGGED_IN) {
            return;
        }

        log.debug("tick {} GE offer updated: state: {}, slot: {}, item: {}, qty: {}, lastLoginTick: {}", client.getTickCount(), offer.getState(), slot, offer.getItemId(), offer.getQuantitySold(), osrsLoginManager.getLastLoginTick());

        SavedOffer currentOffer = SavedOffer.fromGrandExchangeOffer(offer);
        SavedOffer prevOffer = offerManager.loadOffer(accountHash, slot);

        if (Objects.equals(currentOffer, prevOffer)) {
            log.debug("skipping duplicate offer event {}", currentOffer);
            return;
        }

        currentOffer.setCopilotPriceUsed(wasCopilotPriceUsed(currentOffer, prevOffer));
        currentOffer.setWasCopilotSuggestion(wasCopilotSuggestion(currentOffer, prevOffer));

        boolean consistent = isConsistent(prevOffer, currentOffer);
        if (!consistent) {
            log.warn("offer on slot {} is inconsistent with previous saved offer", slot);
        }

        if (hasSlotBecomeFree(currentOffer, prevOffer, consistent)) {
            suggestionManager.setSuggestionNeeded(true);
        }

        Transaction t = inferTransaction(slot, currentOffer, prevOffer);
        if (t != null) {
            t.setConsistent(consistent);
            t.setLogin(client.getTickCount() <= osrsLoginManager.getLastLoginTick() + GE_LOGIN_BURST_WINDOW);
            transactionsToProcess.add(t);
        }
        updateUncollected(accountHash, slot, currentOffer, prevOffer, consistent);
        offerManager.saveOffer(accountHash, slot, currentOffer);
    }

    private void processTransactions() {
        String displayName = osrsLoginManager.getPlayerDisplayName();
        if (displayName != null) {
            Transaction transaction;
            while ((transaction = transactionsToProcess.poll()) != null) {
                long profit = transactionManager.addTransaction(transaction, displayName);
                if (profit != 0) {
                    new GpDropOverlay(overlayManager, client, profit, transaction.getBoxId());
                }
            }
        }
    }

    private boolean wasCopilotPriceUsed(SavedOffer current, SavedOffer prev) {
        if (isNewOffer(prev, current)) {
            return current.getItemId() == offerManager.getViewedSlotItemId() && current.getPrice() == offerManager.getViewedSlotItemPrice() && Instant.now().minusSeconds(30).isBefore(Instant.ofEpochSecond(offerManager.getLastViewedSlotPriceTime()));
        }
        return prev != null && prev.isCopilotPriceUsed();
    }

    private boolean wasCopilotSuggestion(SavedOffer current, SavedOffer prev) {
        if (isNewOffer(prev, current)) {
            return current.getItemId() == suggestionManager.getSuggestionItemIdOnOfferSubmitted() && current.getOfferStatus().equals(suggestionManager.getSuggestionOfferStatusOnOfferSubmitted());
        }
        return prev != null && prev.isWasCopilotSuggestion();
    }

    private void updateUncollected(Long accountHash, int slot, SavedOffer current, SavedOffer prev, boolean consistent) {
        if (!consistent || prev == null) {
            return;
        }
        // FIX: Change uncollectedGp to a long to prevent lossy conversion
        long uncollectedGp = 0;
        int uncollectedItems = 0;
        int quantityChange = current.getQuantitySold() - prev.getQuantitySold();

        if (quantityChange > 0) {
            if (current.getOfferStatus() == OfferStatus.BUY) {
                uncollectedItems = quantityChange;
            } else if (current.getOfferStatus() == OfferStatus.SELL) {
                uncollectedGp = (long) quantityChange * current.getPrice();
            }
        }

        switch (current.getState()) {
            case CANCELLED_BUY:
                uncollectedGp = (long) (current.getTotalQuantity() - current.getQuantitySold()) * current.getPrice();
                break;
            case CANCELLED_SELL:
                uncollectedItems = current.getTotalQuantity() - current.getQuantitySold();
                break;
            case EMPTY:
                grandExchangeUncollectedManager.ensureSlotClear(accountHash, slot);
                return;
        }

        if (uncollectedItems > 0 || uncollectedGp > 0) {
            grandExchangeUncollectedManager.addUncollected(accountHash, slot, current.getItemId(), uncollectedItems, uncollectedGp);
        }
    }

    public Transaction inferTransaction(int slot, SavedOffer offer, SavedOffer prev) {
        if (prev == null) return null;
        int quantityDiff = offer.getQuantitySold() - prev.getQuantitySold();
        long amountSpentDiff = offer.getSpent() - prev.getSpent();

        if (quantityDiff > 0 && amountSpentDiff >= 0) {
            ItemComposition itemComposition = itemManager.getItemComposition(offer.getItemId());
            String itemName = (itemComposition != null) ? itemComposition.getName() : "Unknown Item";

            return new Transaction(
                    UUID.randomUUID().toString(),
                    offer.getOfferStatus(),
                    offer.getItemId(),
                    itemName,
                    offer.getPrice(),
                    quantityDiff,
                    slot,
                    (int) amountSpentDiff,
                    Instant.now(),
                    offer.isCopilotPriceUsed(),
                    offer.isWasCopilotSuggestion(),
                    offer.getTotalQuantity(),
                    false,
                    true
            );
        }
        return null;
    }

    private boolean isConsistent(SavedOffer prev, SavedOffer updated) {
        if (prev == null) return true;
        if (updated.getState() == GrandExchangeOfferState.EMPTY) return true;
        return prev.getItemId() == updated.getItemId() &&
                prev.getPrice() == updated.getPrice() &&
                prev.getTotalQuantity() == updated.getTotalQuantity();
    }

    private boolean isNewOffer(SavedOffer prev, SavedOffer updated) {
        return prev == null || isConsistent(prev, updated) == false;
    }

    private boolean hasSlotBecomeFree(SavedOffer offer, SavedOffer prev, boolean consistent) {
        return offer.isFreeSlot() && (prev == null || !consistent || !prev.isFreeSlot());
    }
}