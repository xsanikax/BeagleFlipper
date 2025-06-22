package com.beagleflipper.model;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import net.runelite.api.GrandExchangeOffer;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class Offer {
    private OfferStatus status;
    private int itemId;
    private int quantity;
    private int price;
    private long spent;
    private int quantitySold;
    private long gpToCollect;
    private Map<Integer, Long> itemsToCollect;
    private int boxId;
    private boolean consistent;
    private boolean login;

    public static Offer getEmptyOffer(int slot) {
        return new Offer(OfferStatus.EMPTY, 0, 0, 0, 0, 0, 0, new HashMap<>(), slot, true, false);
    }

    public static Offer fromRunelite(GrandExchangeOffer runeliteOffer, int slot) {
        Offer offer = new Offer();
        offer.setStatus(OfferStatus.fromRunelite(runeliteOffer.getState()));
        offer.setItemId(runeliteOffer.getItemId());
        offer.setQuantity(runeliteOffer.getTotalQuantity());
        offer.setPrice(runeliteOffer.getPrice());
        offer.setSpent(runeliteOffer.getSpent());
        offer.setQuantitySold(runeliteOffer.getQuantitySold());
        offer.setBoxId(slot);

        long itemsToCollect = 0;
        long gpToCollect = 0;

        switch (runeliteOffer.getState()) {
            case BOUGHT:
                itemsToCollect = runeliteOffer.getTotalQuantity();
                break;
            case SOLD:
                gpToCollect = (long) runeliteOffer.getPrice() * runeliteOffer.getQuantitySold();
                break;
            case CANCELLED_BUY:
                itemsToCollect = runeliteOffer.getQuantitySold();
                gpToCollect = (long) (runeliteOffer.getTotalQuantity() - runeliteOffer.getQuantitySold()) * runeliteOffer.getPrice();
                break;
            case CANCELLED_SELL:
                // FIX: Corrected typo from "runelifeOffer" to "runeliteOffer"
                itemsToCollect = runeliteOffer.getTotalQuantity() - runeliteOffer.getQuantitySold();
                gpToCollect = (long) runeliteOffer.getQuantitySold() * runeliteOffer.getPrice();
                break;
        }

        Map<Integer, Long> itemsMap = new HashMap<>();
        if (itemsToCollect > 0) {
            itemsMap.put(offer.getItemId(), itemsToCollect);
        }

        offer.setItemsToCollect(itemsMap);
        offer.setGpToCollect(gpToCollect);
        offer.setConsistent(true);
        offer.setLogin(false);

        return offer;
    }

    public long cashStackGpValue() {
        if (status == OfferStatus.BUY) {
            return (long) (quantity - quantitySold) * price;
        }
        return 0;
    }

    public Transaction getTransaction(Offer oldOffer) {
        if (this.equals(oldOffer)) {
            return null;
        }
        int quantityChange = this.quantitySold - oldOffer.quantitySold;
        long spentChange = this.spent - oldOffer.spent;

        if (quantityChange > 0 && spentChange >= 0) { // Allow 0 spent change for free items
            return new Transaction(
                    UUID.randomUUID().toString(),
                    this.status,
                    this.itemId,
                    null,
                    this.price,
                    quantityChange,
                    this.boxId,
                    (int) spentChange,
                    Instant.now(),
                    false,
                    false,
                    this.quantity,
                    this.login,
                    this.consistent
            );
        }
        return null;
    }

    // FIX: Added the missing toJson method
    public JsonObject toJson(Gson gson) {
        JsonObject jsonObject = new JsonObject();
        jsonObject.addProperty("status", status.name().toLowerCase());
        jsonObject.addProperty("item_id", itemId);
        jsonObject.addProperty("quantity", quantity);
        jsonObject.addProperty("price", price);
        jsonObject.addProperty("spent", spent);
        jsonObject.addProperty("quantity_sold", quantitySold);
        jsonObject.addProperty("gp_to_collect", gpToCollect);
        jsonObject.add("items_to_collect", gson.toJsonTree(itemsToCollect));
        jsonObject.addProperty("box_id", boxId);
        jsonObject.addProperty("consistent", consistent);
        jsonObject.addProperty("login", login);
        return jsonObject;
    }
}