package com.beagleflipper.model;

import com.google.gson.annotations.SerializedName;
import lombok.Data;

@Data
public class FlipV2 {

    @SerializedName("id")
    private String id;

    @SerializedName("account_id")
    private int accountId;

    @SerializedName("item_id")
    private int itemId;

    @SerializedName("item_name")
    private String itemName;

    @SerializedName("opened_time")
    private int openedTime;

    @SerializedName("opened_quantity")
    private int openedQuantity;

    @SerializedName("spent")
    private long spent;

    @SerializedName("closed_time")
    private int closedTime;

    @SerializedName("closed_quantity")
    private int closedQuantity;

    @SerializedName("received_post_tax")
    private long receivedPostTax;

    @SerializedName("profit")
    private long profit;

    @SerializedName("tax_paid")
    private long taxPaid;

    @SerializedName("is_closed")
    private boolean isClosed;

    private String accountDisplayName;

    // This method is required by FlipManager for the GP drop overlay estimation
    public long calculateProfit(Transaction transaction) {
        if (openedQuantity == 0 || transaction.getType() != OfferStatus.SELL) {
            return 0;
        }
        long avgBuyPrice = spent / openedQuantity;
        long costOfGoodsSold = avgBuyPrice * transaction.getQuantity();

        int sellPrice = transaction.getPrice();
        long revenue = (long) sellPrice * transaction.getQuantity();
        // Uses the 2% tax rate from your config for the estimation
        long tax = (long) Math.floor(revenue * 0.02);
        long revenueAfterTax = revenue - tax;

        return revenueAfterTax - costOfGoodsSold;
    }
}