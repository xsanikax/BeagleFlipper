package com.beagleflipper.controller;

import com.beagleflipper.model.*;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.*;
import net.runelite.api.widgets.ComponentID;
import net.runelite.api.widgets.Widget;

import javax.inject.Inject;
import javax.inject.Singleton;
import java.time.Instant;
import java.util.Objects;
import java.util.function.Consumer;

@Slf4j
@Getter
@Singleton
@RequiredArgsConstructor(onConstructor_ = @Inject)
public class OfferHandler {

    private static final int GE_OFFER_INIT_STATE_CHILD_ID = 20;

    private final Client client;
    private final SuggestionManager suggestionManager;
    private final ApiRequestHandler apiRequestHandler;
    private final OsrsLoginManager osrsLoginManager;
    private final OfferManager offerManager;
    private final HighlightController highlightController;
    private final LoginResponseManager loginResponseManager;

    private String viewedSlotPriceErrorText = null;

    public void fetchSlotItemPrice(boolean isViewingSlot) {
        if (isViewingSlot) {
            var currentItemId = client.getVarpValue(VarPlayer.CURRENT_GE_ITEM);
            offerManager.setViewedSlotItemId(currentItemId);
            if (currentItemId == -1 || currentItemId == 0) return;

            var suggestion = suggestionManager.getSuggestion();
            if (suggestion != null && suggestion.getItemId() == currentItemId &&
                    ((Objects.equals(suggestion.getType(), "sell") && isSelling()) ||
                            (Objects.equals(suggestion.getType(), "buy") && isBuying()))) {
                offerManager.setLastViewedSlotItemId(suggestion.getItemId());
                offerManager.setLastViewedSlotItemPrice(suggestion.getPrice());
                offerManager.setLastViewedSlotPriceTime((int) Instant.now().getEpochSecond());
                return;
            }

            if (!loginResponseManager.isLoggedIn()) {
                viewedSlotPriceErrorText = "Login to copilot to see item price.";
                highlightController.redraw();
                return;
            }

            viewedSlotPriceErrorText = "Fetching price...";
            highlightController.redraw();

            Consumer<ItemPrice> consumer = (fetchedPrice) -> {
                if (fetchedPrice == null) {
                    viewedSlotPriceErrorText = "Unknown error fetching price.";
                } else if (fetchedPrice.getMessage() != null && !fetchedPrice.getMessage().isEmpty()) {
                    viewedSlotPriceErrorText = fetchedPrice.getMessage();
                } else {
                    viewedSlotPriceErrorText = null;
                    int priceToSet = isSelling() ? fetchedPrice.getSellPrice() : fetchedPrice.getBuyPrice();
                    offerManager.setViewedSlotItemPrice(priceToSet);
                    offerManager.setViewedSlotItemId(currentItemId);
                    offerManager.setLastViewedSlotPriceTime((int) Instant.now().getEpochSecond());
                    log.debug("fetched item {} price: {}", currentItemId, priceToSet);
                }
                highlightController.redraw();
            };
            apiRequestHandler.getItemPriceAsync(currentItemId, osrsLoginManager.getPlayerDisplayName(), consumer);
        } else {
            offerManager.setViewedSlotItemPrice(-1);
            offerManager.setViewedSlotItemId(-1);
            viewedSlotPriceErrorText = null;
        }
        highlightController.redraw();
    }

    // FIX: Added this entire method, which is needed by KeybindHandler.java
    public void setSuggestedAction(Suggestion suggestion) {
        if (suggestion == null) return;
        var currentItemId = client.getVarpValue(VarPlayer.CURRENT_GE_ITEM);

        if (isSettingQuantity()) {
            if (currentItemId == suggestion.getItemId() && getOfferType().equals(suggestion.getType())) {
                setChatboxValue(suggestion.getQuantity());
            }
        } else if (isSettingPrice()) {
            if (currentItemId == suggestion.getItemId() && getOfferType().equals(suggestion.getType())) {
                setChatboxValue(suggestion.getPrice());
            } else if (getViewedSlotPriceErrorText() == null && currentItemId == offerManager.getViewedSlotItemId()) {
                setChatboxValue(offerManager.getViewedSlotItemPrice());
            }
        }
    }

    public boolean isSettingQuantity() {
        var chatboxTitleWidget = getChatboxTitleWidget();
        if (chatboxTitleWidget == null) return false;
        String chatInputText = chatboxTitleWidget.getText();
        return chatInputText.equals("How many do you wish to buy?") || chatInputText.equals("How many do you wish to sell?");
    }

    public boolean isSettingPrice() {
        var chatboxTitleWidget = getChatboxTitleWidget();
        if (chatboxTitleWidget == null) return false;
        String chatInputText = chatboxTitleWidget.getText();
        var offerTextWidget = getOfferTextWidget();
        if (offerTextWidget == null) return false;
        String offerText = offerTextWidget.getText();
        return chatInputText.equals("Set a price for each item:") && (offerText.equals("Buy offer") || offerText.equals("Sell offer"));
    }

    private Widget getChatboxTitleWidget() {
        return client.getWidget(ComponentID.CHATBOX_TITLE);
    }

    private Widget getOfferTextWidget() {
        var offerContainerWidget = client.getWidget(ComponentID.GRAND_EXCHANGE_OFFER_CONTAINER);
        if (offerContainerWidget == null) return null;
        return offerContainerWidget.getChild(GE_OFFER_INIT_STATE_CHILD_ID);
    }

    public boolean isSelling() {
        return client.getVarbitValue(Varbits.GE_OFFER_CREATION_TYPE) == 1;
    }

    public boolean isBuying() {
        return client.getVarbitValue(Varbits.GE_OFFER_CREATION_TYPE) == 0;
    }

    public String getOfferType() {
        if (isBuying()) {
            return "buy";
        } else if (isSelling()) {
            return "sell";
        } else {
            return null;
        }
    }

    public void setChatboxValue(int value) {
        client.setVarcStrValue(VarClientStr.INPUT_TEXT, String.valueOf(value));
        Widget chatboxInput = client.getWidget(ComponentID.CHATBOX_FULL_INPUT);
        if (chatboxInput != null) {
            chatboxInput.setText(value + "*");
        }
    }
}