package com.beagleflipper.model;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.annotations.SerializedName;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;
import java.util.Map;

@Data
@NoArgsConstructor
public class AccountStatus {

    private List<Integer> blockedItems;
    private boolean sellOnlyMode;
    private String displayName;
    private Long accountHash;
    private boolean isMember;
    private boolean isF2pOnlyMode;
    private int timeframe;
    private boolean isSuggestionsPaused;
    private boolean isSuggestionSkipped;
    private Inventory inventory;
    private StatusOfferList offers;
    private Map<Integer, Long> uncollected;

    // This field will hold the ID of the item to skip when isSuggestionSkipped is true
    private int itemToSkip;

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

        // --- STATE HANDLING FIXES ---
        // The backend expects f2pOnlyMode to be nested within a preferences object.
        JsonObject preferencesObject = new JsonObject();
        preferencesObject.addProperty("f2pOnlyMode", this.isF2pOnlyMode);
        jsonObject.add("preferences", preferencesObject);

        // The backend expects this specific key name.
        jsonObject.addProperty("sell_only_mode", this.sellOnlyMode);

        // This ensures the skip request tells the server *which* item to skip.
        jsonObject.addProperty("skip_suggestion", this.isSuggestionSkipped);
        if (this.isSuggestionSkipped && this.itemToSkip > 0) {
            jsonObject.addProperty("item_to_skip", this.itemToSkip);
            jsonObject.addProperty("current_item_id", this.itemToSkip); // Also add as current_item_id for compatibility
        }
        // --- END OF STATE HANDLING FIXES ---

        jsonObject.add("blocked_items", gson.toJsonTree(this.blockedItems));
        jsonObject.addProperty("timeframe", this.timeframe);
        jsonObject.addProperty("is_suggestions_paused", this.isSuggestionsPaused);
        jsonObject.add("inventory", gson.toJsonTree(this.inventory));
        jsonObject.add("offers", this.offers != null ? this.offers.toJson(gson) : null);
        jsonObject.add("uncollected", gson.toJsonTree(this.uncollected));
        jsonObject.addProperty("grand_exchange_open", grandExchangeOpen);
        jsonObject.addProperty("is_price_graph_website", isPriceGraphWebsite);
        return jsonObject;
    }
}