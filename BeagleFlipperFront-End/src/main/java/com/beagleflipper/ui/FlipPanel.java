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

        JLabel itemQuantityAndName = new JLabel(String.format("%d x %s", flip.getClosedQuantity(), UIUtilities.truncateString(flip.getItemName(), 20)));
        itemQuantityAndName.setForeground(Color.WHITE);

        JPanel leftPanel = new JPanel();
        leftPanel.setLayout(new FlowLayout(FlowLayout.LEFT, 0, 0));
        leftPanel.setBackground(ColorScheme.DARKER_GRAY_COLOR);
        leftPanel.add(itemQuantityAndName);

        // RESTORED: Displays the 'profit' field directly from the flip object
        JLabel profitLabel = new JLabel(UIUtilities.formatProfitWithoutGp(flip.getProfit()));
        profitLabel.setForeground(UIUtilities.getProfitColor(flip.getProfit(), config));

        add(leftPanel, BorderLayout.LINE_START);
        add(profitLabel, BorderLayout.LINE_END);
        setMaximumSize(new Dimension(Integer.MAX_VALUE, getPreferredSize().height));

        String closeLabel = flip.getClosedQuantity() >= flip.getOpenedQuantity() ? "Closed time" : "Partial close time";

        String tooltipText = String.format("<html>" +
                        "ID: %s<br>" +
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
                UIUtilities.formatProfitWithoutGp(flip.getSpent()),
                closeLabel,
                formatEpoch(flip.getClosedTime()),
                flip.getClosedQuantity(),
                UIUtilities.formatProfitWithoutGp(flip.getReceivedPostTax()),
                UIUtilities.formatProfitWithoutGp(flip.getTaxPaid()), // Displays tax from the flip object
                UIUtilities.formatProfitWithoutGp(flip.getProfit()), // Displays profit from the flip object
                flip.isClosed()
        );
        setToolTipText(tooltipText);
    }

    public static String formatEpoch(long epochSeconds) {
        if (epochSeconds <= 0) {
            return "n/a";
        }
        Instant instant = Instant.ofEpochSecond(epochSeconds);
        DateTimeFormatter formatter = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM)
                .withZone(ZoneId.systemDefault());
        return formatter.format(instant);
    }
}