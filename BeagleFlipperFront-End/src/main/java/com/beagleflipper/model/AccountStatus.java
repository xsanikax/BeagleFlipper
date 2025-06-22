package com.beagleflipper.model;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;
import java.util.Map;

@Data
@NoArgsConstructor
public class AccountStatus {
    private String displayName;
    private Long accountHash;
    private boolean isMember;
    private boolean isF2pOnlyMode;
    private boolean isSellOnlyMode;
    private List<Integer> blockedItems;
    private int timeframe;
    private boolean isSuggestionsPaused;
    private boolean isSuggestionSkipped;
    private Inventory inventory;
    private StatusOfferList offers;
    private Map<Integer, Long> uncollected;

    public boolean currentlyFlipping() {
        if (offers == null) return false;
        return offers.stream().anyMatch(offer -> offer.getStatus() != OfferStatus.EMPTY);
    }

    public boolean moreGpNeeded() {
        if (inventory == null) return true;
        return inventory.getTotalGp() < 50000;
    }

    public boolean isCollectNeeded(Suggestion suggestion) {
        if (suggestion != null && "collect".equals(suggestion.getType())) return true;
        return offers != null && offers.stream().anyMatch(offer -> offer.getGpToCollect() > 0 || !offer.getItemsToCollect().isEmpty());
    }

    public JsonObject toJson(Gson gson, boolean grandExchangeOpen, boolean isPriceGraphWebsite) {
        JsonObject jsonObject = new JsonObject();
        jsonObject.addProperty("account_hash", this.accountHash);
        jsonObject.addProperty("display_name", this.displayName);
        jsonObject.addProperty("is_member", this.isMember);
        jsonObject.addProperty("is_f2p_only_mode", this.isF2pOnlyMode);
        jsonObject.addProperty("is_sell_only_mode", this.isSellOnlyMode);
        jsonObject.add("blocked_items", gson.toJsonTree(this.blockedItems));
        jsonObject.addProperty("timeframe", this.timeframe);
        jsonObject.addProperty("is_suggestions_paused", this.isSuggestionsPaused);
        jsonObject.addProperty("skip_suggestion", this.isSuggestionSkipped);

        // FIX: This now sends the inventory as a proper array of items.
        jsonObject.add("inventory", gson.toJsonTree(this.inventory));

        jsonObject.add("offers", this.offers != null ? this.offers.toJson(gson) : null);
        jsonObject.add("uncollected", gson.toJsonTree(this.uncollected));
        jsonObject.addProperty("grand_exchange_open", grandExchangeOpen);
        jsonObject.addProperty("is_price_graph_website", isPriceGraphWebsite);
        return jsonObject;
    }
}