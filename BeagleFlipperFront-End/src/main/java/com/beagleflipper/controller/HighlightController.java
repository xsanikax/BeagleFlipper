package com.beagleflipper.controller;

import com.beagleflipper.model.*;
import com.beagleflipper.ui.WidgetHighlightOverlay;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.Client;
import net.runelite.api.ItemComposition;
import net.runelite.api.VarClientStr;
import net.runelite.api.VarPlayer;
import net.runelite.api.Varbits;
import net.runelite.api.widgets.ComponentID;
import net.runelite.api.widgets.InterfaceID;
import net.runelite.api.widgets.Widget;
import net.runelite.client.ui.overlay.OverlayManager;

import javax.inject.Inject;
import javax.inject.Singleton;
import javax.swing.*;
import java.awt.*;
import java.util.ArrayList;

@Slf4j
@Singleton
@RequiredArgsConstructor(onConstructor_ = @Inject)
public class HighlightController {

    private final BeagleFlipperConfig config;
    private final SuggestionManager suggestionManager;
    private final GrandExchange grandExchange;
    private final AccountStatusManager accountStatusManager;
    private final Client client;
    private final OfferManager offerManager;
    private final OverlayManager overlayManager;
    private final HighlightColorController highlightColorController;

    private final ArrayList<WidgetHighlightOverlay> highlightOverlays = new ArrayList<>();

    public void redraw() {
        removeAll();
        if(!config.suggestionHighlights()) {
            return;
        }
        if (offerManager.isOfferJustPlaced()) {
            return;
        }
        if(suggestionManager.getSuggestionError() != null) {
            return;
        }
        Suggestion suggestion = suggestionManager.getSuggestion();
        if (suggestion == null) {
            return;
        }
        if (grandExchange.isHomeScreenOpen()) {
            drawHomeScreenHighLights(suggestion);
        } else if (grandExchange.isSlotOpen()) {
            drawOfferScreenHighlights(suggestion);
        }
    }

    private void drawHomeScreenHighLights(Suggestion suggestion) {
        AccountStatus accountStatus = accountStatusManager.getAccountStatus();
        if (accountStatus.isCollectNeeded(suggestion)) {
            Widget collectButton = grandExchange.getCollectButton();
            if (collectButton != null) {
                add(collectButton, highlightColorController.getBlueColor(), new Rectangle(2, 1, 81, 18));
            }
        }
        else if (suggestion.getType().equals("abort")) {
            Widget slotWidget = grandExchange.getSlotWidget(suggestion.getBoxId());
            if(slotWidget != null) {
                add(slotWidget, highlightColorController.getRedColor());
            }
        }
        // FIX: Added case for the new "modify" suggestion type to highlight the slot in red.
        else if (suggestion.getType().equals("modify")) {
            Widget slotWidget = grandExchange.getSlotWidget(suggestion.getBoxId());
            if(slotWidget != null) {
                add(slotWidget, highlightColorController.getRedColor());
            }
        }
        else if (suggestion.getType().equals("buy")) {
            int slotId = accountStatus.getOffers().findEmptySlot();
            if (slotId != -1) {
                Widget buyButton = grandExchange.getBuyButton(slotId);
                if (buyButton != null && !buyButton.isHidden()) {
                    add(buyButton, highlightColorController.getBlueColor(), new Rectangle(0, 0, 45, 44));
                }
            }
        }
        else if (suggestion.getType().equals("sell")) {
            Widget itemWidget = getInventoryItemWidget(suggestion.getItemId());
            if (itemWidget != null && !itemWidget.isHidden()) {
                add(itemWidget, highlightColorController.getBlueColor(), new Rectangle(0, 0, 34, 32));
            }
        }
    }

    private void drawOfferScreenHighlights(Suggestion suggestion) {
        Widget offerTypeWidget = grandExchange.getOfferTypeWidget();
        String offerType = client.getVarbitValue(Varbits.GE_OFFER_CREATION_TYPE) == 1 ? "sell" : "buy";
        if (offerTypeWidget != null) {
            if (offerType.equals(suggestion.getType())) {
                if (client.getVarpValue(VarPlayer.CURRENT_GE_ITEM) == suggestion.getItemId()) {
                    if (offerDetailsCorrect(suggestion)) {
                        highlightConfirm();
                    } else {
                        if (grandExchange.getOfferPrice() != suggestion.getPrice()) {
                            highlightPrice();
                        }
                        highlightQuantity(suggestion);
                    }
                } else if (client.getVarpValue(VarPlayer.CURRENT_GE_ITEM ) == -1){
                    highlightItemInSearch(suggestion);
                }
            }
            if (client.getVarpValue(VarPlayer.CURRENT_GE_ITEM) != -1
                    && (client.getVarpValue(VarPlayer.CURRENT_GE_ITEM) != suggestion.getItemId()
                    || !offerType.equals(suggestion.getType()))
                    && client.getVarpValue(VarPlayer.CURRENT_GE_ITEM) == offerManager.getViewedSlotItemId()
                    && offerManager.getViewedSlotItemPrice() > 0) {
                if (grandExchange.getOfferPrice() == offerManager.getViewedSlotItemPrice()) {
                    highlightConfirm();
                } else {
                    highlightPrice();
                }
            }
        }
    }

    private void highlightItemInSearch(Suggestion suggestion) {
        if (!client.getVarcStrValue(VarClientStr.INPUT_TEXT).isEmpty()) {
            return;
        }
        Widget searchResults = client.getWidget(ComponentID.CHATBOX_GE_SEARCH_RESULTS);
        if (searchResults == null) {
            return;
        }
        for (Widget widget : searchResults.getDynamicChildren()) {
            if (widget.getName().equals("<col=ff9040>" + suggestion.getName() + "</col>")) {
                add(widget, highlightColorController.getBlueColor());
                return;
            }
        }
        Widget itemWidget = searchResults.getChild(3);
        if (itemWidget != null && itemWidget.getItemId() == suggestion.getItemId()) {
            add(itemWidget, highlightColorController.getBlueColor());
        }
    }

    private boolean offerDetailsCorrect(Suggestion suggestion) {
        return grandExchange.getOfferPrice() == suggestion.getPrice()
                && grandExchange.getOfferQuantity() == suggestion.getQuantity();
    }

    private void highlightPrice() {
        Widget setPriceButton = grandExchange.getSetPriceButton();
        if (setPriceButton != null) {
            add(setPriceButton, highlightColorController.getBlueColor(), new Rectangle(1, 6, 33, 23));
        }
    }

    private void highlightQuantity(Suggestion suggestion) {
        AccountStatus accountStatus = accountStatusManager.getAccountStatus();
        if (grandExchange.getOfferQuantity() != suggestion.getQuantity()) {
            Widget setQuantityButton;
            if (accountStatus.getInventory().getTotalAmount(suggestion.getItemId()) >= suggestion.getQuantity()) {
                setQuantityButton = grandExchange.getSetQuantityAllButton();
            } else {
                setQuantityButton = grandExchange.getSetQuantityButton();
            }
            if (setQuantityButton != null) {
                add(setQuantityButton, highlightColorController.getBlueColor(), new Rectangle(1, 6, 33, 23));
            }
        }
    }

    private void highlightConfirm() {
        Widget confirmButton = grandExchange.getConfirmButton();
        if (confirmButton != null) {
            add(confirmButton, highlightColorController.getBlueColor(), new Rectangle(1, 1, 150, 38));
        }
    }

    private void add(Widget widget, Color color, Rectangle adjustedBounds) {
        SwingUtilities.invokeLater(() -> {
            WidgetHighlightOverlay overlay = new WidgetHighlightOverlay(widget, color, adjustedBounds);
            highlightOverlays.add(overlay);
            overlayManager.add(overlay);
        });
    }

    private void add(Widget widget, Color color) {
        add(widget, color, new Rectangle(0, 0, widget.getWidth(), widget.getHeight()));
    }

    public void removeAll() {
        SwingUtilities.invokeLater(() -> {
            highlightOverlays.forEach(overlayManager::remove);
            highlightOverlays.clear();
        });
    }

    private Widget getInventoryItemWidget(int unnotedItemId) {
        log.debug("Searching for inventory widget for item ID: {}", unnotedItemId);
        Widget inventory = client.getWidget(InterfaceID.GRAND_EXCHANGE_INVENTORY, 0);
        if (inventory == null) {
            inventory = client.getWidget(InterfaceID.INVENTORY, 0);
        }

        if (inventory == null) {
            log.warn("Could not find any inventory widget.");
            return null;
        }

        for (Widget itemWidget : inventory.getDynamicChildren()) {
            if (itemWidget.isSelfHidden() || itemWidget.getOpacity() > 0 || itemWidget.getItemId() == -1) {
                continue;
            }

            ItemComposition itemDef = client.getItemDefinition(itemWidget.getItemId());
            int currentItemId = itemWidget.getItemId();

            if (itemDef.getNote() != -1) {
                currentItemId = itemDef.getLinkedNoteId();
            }

            if (currentItemId == unnotedItemId) {
                log.debug("Found matching item widget for ID: {}", unnotedItemId);
                return itemWidget;
            }
        }
        log.warn("Could not find item widget for ID: {} in inventory", unnotedItemId);
        return null;
    }
}