package com.beagleflipper.ui;

import com.beagleflipper.controller.BeagleFlipperConfig;
import com.beagleflipper.model.FlipV2;
import net.runelite.client.ui.ColorScheme;

import javax.swing.JLabel;
import javax.swing.JPanel;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;

public class FlipPanel extends JPanel {

    public FlipPanel(FlipV2 flip, BeagleFlipperConfig config) {
        setLayout(new BorderLayout());
        setBackground(ColorScheme.DARKER_GRAY_COLOR);

        // Display quantity and item name
        JLabel itemQuantityAndName = new JLabel(String.format("%d x %s", flip.getClosedQuantity(), UIUtilities.truncateString(flip.getItemName(), 20)));
        itemQuantityAndName.setForeground(Color.WHITE);

        // Create a sub-panel for the left side
        JPanel leftPanel = new JPanel();
        leftPanel.setLayout(new FlowLayout(FlowLayout.LEFT, 0, 0));
        leftPanel.setBackground(ColorScheme.DARKER_GRAY_COLOR);
        leftPanel.add(itemQuantityAndName);

        // Display profit, with color based on profit/loss
        JLabel profitLabel = new JLabel(UIUtilities.formatProfitWithoutGp(flip.getProfit()));
        profitLabel.setForeground(UIUtilities.getProfitColor(flip.getProfit(), config));

        // Add the sub-panel to the LINE_START position
        add(leftPanel, BorderLayout.LINE_START);
        add(profitLabel, BorderLayout.LINE_END);
        setMaximumSize(new Dimension(Integer.MAX_VALUE, getPreferredSize().height));

        // Tooltip for detailed information
        String closeLabel = flip.getClosedQuantity() == flip.getOpenedQuantity() ? "Closed time" : "Partial close time";

        String tooltipText = String.format("<html>" +
                        "ID: %s<br>" + // Add ID for debugging
                        "Item ID: %d<br>" +
                        "Account: %s<br>" +
                        "Opened time: %s<br>" +
                        "Opened quantity: %d<br>" +
                        "Total spent: %s gp<br>" +
                        "%s: %s<br>" +
                        "Closed quantity: %d<br>" +
                        "Received post-tax: %s gp<br>" +
                        "Tax paid: %s gp<br>" +
                        "Profit: %s gp<br>" +
                        "Is Closed: %b" +
                        "</html>",
                flip.getId(),
                flip.getItemId(),
                flip.getAccountDisplayName(),
                formatEpoch(flip.getOpenedTime()),
                flip.getOpenedQuantity(),
                UIUtilities.formatProfitWithoutGp(flip.getSpent()), // Format spent
                closeLabel,
                formatEpoch(flip.getClosedTime()),
                flip.getClosedQuantity(),
                UIUtilities.formatProfitWithoutGp(flip.getReceivedPostTax()), // Format received
                UIUtilities.formatProfitWithoutGp(flip.getTaxPaid()), // Format tax
                UIUtilities.formatProfitWithoutGp(flip.getProfit()), // Format profit
                flip.isClosed()
        );
        setToolTipText(tooltipText);
    }

    public static String formatEpoch(long epochSeconds) {
        if (epochSeconds <= 0) { // Handle uninitialized or 0 timestamps gracefully
            return "n/a";
        }
        Instant instant = Instant.ofEpochSecond(epochSeconds);
        DateTimeFormatter formatter = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM)
                .withZone(ZoneId.systemDefault());
        return formatter.format(instant);
    }
}