package com.beagleflipper.ui;

import com.beagleflipper.controller.BeagleFlipperConfig;
import com.beagleflipper.controller.GrandExchange;
import com.beagleflipper.controller.HighlightController;
import com.beagleflipper.controller.PremiumInstanceController;
import com.beagleflipper.model.*;
import com.beagleflipper.ui.graph.PriceGraphController;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.Client;
import net.runelite.client.callback.ClientThread;
import net.runelite.client.game.ItemManager;
import net.runelite.client.ui.ColorScheme;
import net.runelite.client.util.AsyncBufferedImage;
import net.runelite.client.util.ImageUtil;
import net.runelite.client.util.LinkBrowser;

import javax.inject.Inject;
import javax.inject.Singleton;
import javax.swing.*;
import java.awt.*;
import java.awt.event.*;
import java.awt.image.BufferedImage;
import java.text.NumberFormat;

import static com.beagleflipper.ui.UIUtilities.*;
import static com.beagleflipper.util.Constants.MIN_GP_NEEDED_TO_FLIP;


@Singleton
@Slf4j
public class SuggestionPanel extends JPanel {

    private final BeagleFlipperConfig config;
    private final SuggestionManager suggestionManager;
    private final AccountStatusManager accountStatusManager;
    public final PauseButton pauseButton;
    private final BlockButton blockButton;
    private final OsrsLoginManager osrsLoginManager;
    private final Client client;
    private final PausedManager pausedManager;
    private final GrandExchangeUncollectedManager uncollectedManager;
    private final ClientThread clientThread;
    private final HighlightController highlightController;
    private final ItemManager itemManager;
    private final GrandExchange grandExchange;
    private final PriceGraphController priceGraphController;
    private final PremiumInstanceController premiumInstanceController;

    private final JLabel suggestionText = new JLabel();
    private final JLabel suggestionIcon = new JLabel();
    private final JPanel suggestionTextContainer = new JPanel();
    public final Spinner spinner = new Spinner();
    private JLabel skipButton;
    private final JPanel buttonContainer = new JPanel();
    private JLabel graphButton;
    private final JPanel suggestedActionPanel;
    private final PreferencesPanel preferencesPanel;
    private final JLayeredPane layeredPane = new JLayeredPane();
    private boolean isPreferencesPanelVisible = false;
    private final JLabel gearButton;
    private String innerSuggestionMessage;
    private String highlightedColor = "yellow";

    @Setter
    private String serverMessage = "";


    @Inject
    public SuggestionPanel(BeagleFlipperConfig config,
                           SuggestionManager suggestionManager,
                           AccountStatusManager accountStatusManager,
                           PauseButton pauseButton,
                           BlockButton blockButton,
                           PreferencesPanel preferencesPanel,
                           OsrsLoginManager osrsLoginManager,
                           Client client, PausedManager pausedManager,
                           GrandExchangeUncollectedManager uncollectedManager,
                           ClientThread clientThread,
                           HighlightController highlightController,
                           ItemManager itemManager,
                           GrandExchange grandExchange, PriceGraphController priceGraphController, PremiumInstanceController premiumInstanceController) {
        this.preferencesPanel = preferencesPanel;
        this.config = config;
        this.suggestionManager = suggestionManager;
        this.accountStatusManager = accountStatusManager;
        this.pauseButton = pauseButton;
        this.blockButton = blockButton;
        this.osrsLoginManager = osrsLoginManager;
        this.client = client;
        this.pausedManager = pausedManager;
        this.uncollectedManager = uncollectedManager;
        this.clientThread = clientThread;
        this.highlightController = highlightController;
        this.itemManager = itemManager;
        this.grandExchange = grandExchange;
        this.priceGraphController = priceGraphController;
        this.premiumInstanceController = premiumInstanceController;

        layeredPane.setLayout(null);

        suggestedActionPanel = new JPanel(new BorderLayout());
        suggestedActionPanel.setBackground(ColorScheme.DARKER_GRAY_COLOR);
        suggestedActionPanel.setBorder(BorderFactory.createEmptyBorder(10, 15, 10, 15));
        suggestedActionPanel.setBounds(0, 0, 300, 150);
        JLabel title = new JLabel("<html><center> <FONT COLOR=white><b>Suggested Action:" +
                "</b></FONT></center></html>");
        title.setHorizontalAlignment(SwingConstants.CENTER);
        suggestedActionPanel.add(title, BorderLayout.NORTH);

        JPanel suggestionContainer = new JPanel(new CardLayout());
        suggestionContainer.setOpaque(true);
        suggestionContainer.setBackground(ColorScheme.DARKER_GRAY_COLOR);
        suggestionContainer.setPreferredSize(new Dimension(0, 85));
        suggestedActionPanel.add(suggestionContainer, BorderLayout.CENTER);

        suggestionTextContainer.setLayout(new BoxLayout(suggestionTextContainer, BoxLayout.X_AXIS));
        suggestionTextContainer.add(Box.createHorizontalGlue());
        suggestionTextContainer.add(suggestionIcon);
        suggestionTextContainer.add(suggestionText);
        suggestionTextContainer.add(Box.createHorizontalGlue());
        suggestionTextContainer.setOpaque(true);
        suggestionTextContainer.setBackground(ColorScheme.DARKER_GRAY_COLOR);
        suggestionIcon.setVisible(false);
        suggestionIcon.setOpaque(true);
        suggestionIcon.setBackground(ColorScheme.DARKER_GRAY_COLOR);
        suggestionIcon.setBorder(BorderFactory.createEmptyBorder(0, 0, 0, 0));

        suggestionText.setHorizontalAlignment(SwingConstants.CENTER);
        suggestionText.setBorder(BorderFactory.createEmptyBorder(0, 6, 0, 6));
        suggestionContainer.add(suggestionTextContainer);

        suggestionContainer.add(spinner);
        setupButtonContainer();
        suggestedActionPanel.add(buttonContainer, BorderLayout.SOUTH);


        layeredPane.add(suggestedActionPanel, JLayeredPane.DEFAULT_LAYER);

        this.preferencesPanel.setVisible(false);
        layeredPane.add(this.preferencesPanel, JLayeredPane.DEFAULT_LAYER);

        BufferedImage gearIcon = ImageUtil.loadImageResource(getClass(), "/preferences-icon.png");
        gearIcon = ImageUtil.resizeImage(gearIcon, 20, 20);
        BufferedImage recoloredIcon = ImageUtil.recolorImage(gearIcon, ColorScheme.LIGHT_GRAY_COLOR);
        gearButton = buildButton(recoloredIcon, "Settings", this::handleGearClick);
        gearButton.setEnabled(true);
        gearButton.setFocusable(true);
        gearButton.setBackground(ColorScheme.DARKER_GRAY_COLOR);
        gearButton.setOpaque(true);
        gearButton.setBounds(5, 5, 20, 20);
        layeredPane.add(gearButton, JLayeredPane.PALETTE_LAYER);

        setLayout(new BorderLayout());
        setBackground(ColorScheme.DARKER_GRAY_COLOR);
        setPreferredSize(new Dimension(0, 150));

        add(layeredPane);

        addComponentListener(new ComponentAdapter() {
            @Override
            public void componentResized(ComponentEvent e) {
                preferencesPanel.setBounds(0, 0, getWidth(), getHeight());
                suggestedActionPanel.setBounds(0, 0, getWidth(), getHeight());
                layeredPane.setPreferredSize(new Dimension(getWidth(), getHeight()));
            }
        });
    }

    private void handleGearClick() {
        isPreferencesPanelVisible = !isPreferencesPanelVisible;
        preferencesPanel.setVisible(isPreferencesPanelVisible);
        suggestedActionPanel.setVisible(!isPreferencesPanelVisible);
        refresh();
        layeredPane.revalidate();
        layeredPane.repaint();
    }

    private void setupButtonContainer() {
        buttonContainer.setLayout(new BorderLayout());
        buttonContainer.setBackground(ColorScheme.DARKER_GRAY_COLOR);

        JPanel centerPanel = new JPanel(new GridLayout(1, 5, 15, 0));
        centerPanel.setBackground(ColorScheme.DARKER_GRAY_COLOR);

        BufferedImage graphIcon = ImageUtil.loadImageResource(getClass(), "/graph.png");
        graphButton = buildButton(graphIcon, "Price graph", () -> {
            Suggestion suggestion = suggestionManager.getSuggestion();
            if (suggestion == null || suggestion.getName() == null) return;
            if(config.priceGraphWebsite().equals(BeagleFlipperConfig.PriceGraphWebsite.BEAGLE_FLIPPER)) {
                priceGraphController.showPriceGraph( suggestion.getName(),true);
            } else {
                String url = config.priceGraphWebsite().getUrl(suggestion.getName(), suggestion.getItemId());
                LinkBrowser.browse(url);
            }
        });
        centerPanel.add(graphButton);

        JPanel emptyPanel = new JPanel();
        emptyPanel.setOpaque(false);
        centerPanel.add(emptyPanel);
        centerPanel.add(pauseButton);
        centerPanel.add(blockButton);

        BufferedImage skipIcon = ImageUtil.loadImageResource(getClass(), "/skip.png");
        skipButton = buildButton(skipIcon, "Skip suggestion", () -> {
            showLoading();
            Suggestion s = suggestionManager.getSuggestion();
            accountStatusManager.setSkipSuggestion(s != null ? s.getId() : -1);
            suggestionManager.setSuggestionNeeded(true);
        });
        centerPanel.add(skipButton);

        buttonContainer.add(centerPanel, BorderLayout.CENTER);
    }


    private void setItemIcon(int itemId) {
        AsyncBufferedImage image = itemManager.getImage(itemId);
        if (image != null) {
            image.addTo(suggestionIcon);
            suggestionIcon.setVisible(true);
        }
    }


    public void updateSuggestion(Suggestion suggestion) {
        suggestionIcon.setIcon(null);
        suggestionIcon.setVisible(false);
        setButtonsVisible(false);

        NumberFormat formatter = NumberFormat.getNumberInstance();
        String suggestionString = "<html><center>";

        switch (suggestion.getType()) {
            case "wait":
                suggestionString += "Wait <br>";
                break;
            case "collect":
                suggestionString += "Collect items from<br><FONT COLOR=white>" + suggestion.getName() + "</FONT>";
                setItemIcon(suggestion.getItemId());
                break;
            case "abort":
                suggestionString += "Abort offer for<br><FONT COLOR=white>" + suggestion.getName() + "</FONT>";
                setItemIcon(suggestion.getItemId());
                setButtonsVisible(true);
                break;
            case "modify": // FIX: Added case for the new "modify" suggestion type.
                suggestionString += "Modify offer for<br><FONT COLOR=white>" + suggestion.getName() + "</FONT>";
                setItemIcon(suggestion.getItemId());
                setButtonsVisible(true);
                break;
            case "buy":
            case "sell":
                String capitalisedAction = suggestion.getType().substring(0, 1).toUpperCase() + suggestion.getType().substring(1);
                suggestionString += capitalisedAction +
                        " <FONT COLOR=" + highlightedColor + ">" + formatter.format(suggestion.getQuantity()) + "</FONT><br>" +
                        "<FONT COLOR=white>" + suggestion.getName() + "</FONT><br>" +
                        "for <FONT COLOR=" + highlightedColor + ">" + formatter.format(suggestion.getPrice()) + "</FONT> gp<br>";
                setItemIcon(suggestion.getItemId());
                setButtonsVisible(true);
                break;
            default:
                suggestionString += "Error processing suggestion<br>";
        }

        if (suggestion.getMessage() != null && !suggestion.getMessage().isEmpty()) {
            suggestionString += suggestion.getMessage();
        }
        suggestionString += "</center></html>";

        innerSuggestionMessage = "";
        suggestionText.setText(suggestionString);
        suggestionText.setMaximumSize(new Dimension(suggestionText.getPreferredSize().width, Integer.MAX_VALUE));
        suggestionTextContainer.setVisible(true);
        suggestionTextContainer.revalidate();
        suggestionTextContainer.repaint();
    }

    public void suggestCollect() {
        setMessage("Collect items");
        setButtonsVisible(false);
    }

    public void suggestAddGp() {
        NumberFormat formatter = NumberFormat.getNumberInstance();
        setMessage("Add " +
                "at least <FONT COLOR=" + highlightedColor + ">" + formatter.format(MIN_GP_NEEDED_TO_FLIP)
                + "</FONT> gp<br>to your inventory<br>"
                + "to get a flip suggestion");
        setButtonsVisible(false);
    }

    public void suggestOpenGe() {
        setMessage("Open the Grand Exchange<br>"
                + "to get a flip suggestion");
        setButtonsVisible(false);
    }

    public void setIsPausedMessage() {
        setMessage("Suggestions are paused");
        setButtonsVisible(false);
    }

    public void setMessage(String message) {
        innerSuggestionMessage = message;
        setButtonsVisible(false);

        String displayMessage = message;
        if (message != null && message.contains("<manage>")) {
            displayMessage = message.replace("<manage>",
                    "<a href='#' style='text-decoration:underline'>manage</a>");

            boolean hasListener = false;
            for (MouseListener listener : suggestionText.getMouseListeners()) {
                if (listener instanceof ManageClickListener) {
                    hasListener = true;
                    break;
                }
            }

            if (!hasListener) {
                suggestionText.addMouseListener(new ManageClickListener());
                suggestionText.setCursor(new Cursor(Cursor.HAND_CURSOR));
            }
        } else {
            suggestionText.setCursor(new Cursor(Cursor.DEFAULT_CURSOR));
        }
        suggestionText.setText("<html><center>" + displayMessage + "<br>" + serverMessage + "</center></html>");
        suggestionText.setMaximumSize(new Dimension(suggestionText.getPreferredSize().width, Integer.MAX_VALUE));
        suggestionTextContainer.revalidate();
        suggestionTextContainer.repaint();
    }

    private class ManageClickListener extends MouseAdapter {
        @Override
        public void mouseClicked(MouseEvent e) {
            String text = suggestionText.getText();
            if (text != null && text.contains("manage")) {
                premiumInstanceController.loadAndOpenPremiumInstanceDialog();
            }
        }
    }

    public boolean isCollectItemsSuggested() {
        return "Collect items".equals(innerSuggestionMessage);
    }

    public void showLoading() {
        suggestionTextContainer.setVisible(false);
        setServerMessage("");
        spinner.show();
        setButtonsVisible(false);
        suggestionIcon.setVisible(false);
        suggestionText.setText("");
    }

    public void hideLoading() {
        spinner.hide();
        suggestionTextContainer.setVisible(true);
    }

    private void setButtonsVisible(boolean visible) {
        skipButton.setVisible(visible);
        blockButton.setVisible(visible);
        graphButton.setVisible(visible);
        suggestionIcon.setVisible(visible);
    }

    public void displaySuggestion() {
        Suggestion suggestion = suggestionManager.getSuggestion();
        if (suggestion == null) {
            setMessage("Waiting for a profitable flip...");
            return;
        }
        AccountStatus accountStatus = accountStatusManager.getAccountStatus();
        if(accountStatus == null) {
            return;
        }
        setServerMessage(suggestion.getMessage());
        boolean collectNeeded = accountStatus.isCollectNeeded(suggestion);
        if(collectNeeded && !uncollectedManager.HasUncollected(osrsLoginManager.getAccountHash())) {
            log.warn("tick {} collect is suggested but there is nothing to collect! suggestion: {} {} {}", client.getTickCount(), suggestion.getType(), suggestion.getQuantity(), suggestion.getItemId());
        }
        if (collectNeeded) {
            suggestCollect();
        } else if(suggestion.getType().equals("wait") && !grandExchange.isOpen() && accountStatus.getOffers().emptySlotExists()) {
            suggestOpenGe();
        }else if (suggestion.getType().equals("wait") && accountStatus.moreGpNeeded()) {
            suggestAddGp();
        }  else {
            updateSuggestion(suggestion);
        }
        highlightController.redraw();
    }

    public void refresh() {
        log.debug("refreshing suggestion panel {}", client.getGameState());
        if(!SwingUtilities.isEventDispatchThread()) {
            SwingUtilities.invokeLater(this::refresh);
            return;
        }
        if(isPreferencesPanelVisible) {
            preferencesPanel.refresh();
        }
        if (pausedManager.isPaused()) {
            setIsPausedMessage();
            hideLoading();
            return;
        }

        String errorMessage = osrsLoginManager.getInvalidStateDisplayMessage();
        if (errorMessage != null) {
            setMessage(errorMessage);
            hideLoading();
            return;
        }

        if(suggestionManager.isSuggestionRequestInProgress()) {
            showLoading();
            return;
        }
        hideLoading();

        final HttpResponseException suggestionError = suggestionManager.getSuggestionError();
        if(suggestionError != null) {
            highlightController.redraw();
            setMessage("Error: " + suggestionError.getMessage());
            return;
        }

        if(!client.isClientThread()) {
            clientThread.invoke(this::displaySuggestion);
        } else {
            displaySuggestion();
        }
    }
}