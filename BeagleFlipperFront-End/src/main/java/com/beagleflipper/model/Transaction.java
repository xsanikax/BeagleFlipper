package com.beagleflipper.model;

import com.google.gson.JsonObject;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID; // KEEP this import if you still use UUID.randomUUID() for fallback, but id itself is String


@Getter
@AllArgsConstructor
@NoArgsConstructor
@Setter
public class Transaction {

    private String id;
    private OfferStatus type;
    private int itemId;
    private String itemName; // NEW: Add itemName field
    private int price;
    private int quantity;
    private int boxId;
    private int amountSpent;
    private Instant timestamp;
    private boolean copilotPriceUsed;
    private boolean wasCopilotSuggestion;
    private int offerTotalQuantity;
    private boolean login;
    private boolean consistent;

    public boolean equals(Transaction other) {
        return Objects.equals(this.id, other.id) &&
                this.type == other.type &&
                this.itemId == other.itemId &&
                Objects.equals(this.itemName, other.itemName) && // NEW: Compare itemName
                this.price == other.price &&
                this.quantity == other.quantity &&
                this.boxId == other.boxId &&
                this.amountSpent == other.amountSpent;
    }

    public JsonObject toJsonObject() {
        JsonObject jsonObject = new JsonObject();
        jsonObject.addProperty("id", id != null ? id : UUID.randomUUID().toString());
        jsonObject.addProperty("item_id", itemId);
        jsonObject.addProperty("item_name", itemName); // NEW: Add itemName to JSON
        jsonObject.addProperty("price", price);
        jsonObject.addProperty("quantity", quantity);
        jsonObject.addProperty("box_id", boxId);
        jsonObject.addProperty("amount_spent", amountSpent);
        jsonObject.addProperty("time", timestamp != null ? timestamp.getEpochSecond() : 0);
        jsonObject.addProperty("copilot_price_used", copilotPriceUsed);
        jsonObject.addProperty("was_copilot_suggestion", wasCopilotSuggestion);
        jsonObject.addProperty("consistent_previous_offer", consistent);
        jsonObject.addProperty("login", login);
        jsonObject.addProperty("offer_total_quantity", offerTotalQuantity);
        jsonObject.addProperty("type", this.type != null ? this.type.name().toLowerCase() : "unknown");

        return jsonObject;
    }

    @Override
    public String toString() {
        return String.format("%s %d x %s on slot %d", type, quantity, itemName, boxId); // NEW: Include itemName in toString
    }
}
