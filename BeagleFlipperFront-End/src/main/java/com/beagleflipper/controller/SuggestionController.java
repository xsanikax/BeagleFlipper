package com.beagleflipper.controller;

import com.beagleflipper.model.*;
import com.beagleflipper.ui.*;
import com.beagleflipper.ui.graph.PriceGraphController;
import com.beagleflipper.ui.graph.model.Data;
import com.google.gson.Gson;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.ChatMessageType;
import net.runelite.api.Client;
import net.runelite.client.Notifier;
import net.runelite.client.callback.ClientThread;
import net.runelite.client.chat.ChatMessageBuilder;

import javax.inject.Inject;
import javax.inject.Singleton;
import javax.swing.JOptionPane;
import java.util.concurrent.ScheduledExecutorService;
import java.util.function.Consumer;

@Slf4j
@Getter
@Setter
@Singleton
@RequiredArgsConstructor(onConstructor_ = @Inject)
public class SuggestionController {

    // dependencies
    private final PausedManager pausedManager;
    private final Client client;
    private final Gson gson;
    private final OsrsLoginManager osrsLoginManager;
    private final HighlightController highlightController;
    private final GrandExchange grandExchange;
    private final ScheduledExecutorService executorService;
    private final ApiRequestHandler apiRequestHandler;
    private final Notifier notifier;
    private final OfferManager offerManager;
    private final LoginResponseManager loginResponseManager;
    private final ClientThread clientThread;
    private final BeagleFlipperConfig config;
    private final SuggestionManager suggestionManager;
    private final AccountStatusManager accountStatusManager;
    private final GrandExchangeUncollectedManager uncollectedManager;
    private final PriceGraphController graphPriceGraphController;
    private final SuggestionPreferencesManager preferencesManager;

    private MainPanel mainPanel;
    private LoginPanelV2 loginPanel;
    private CopilotPanel copilotPanel;
    private SuggestionPanel suggestionPanel;

    // This timestamp will track when the user last clicked the skip or block button.
    private long lastManualActionTime = 0;

    public void togglePause() {
        if (pausedManager.isPaused()) {
            pausedManager.setPaused(false);
            suggestionManager.setSuggestionNeeded(true);
            suggestionPanel.refresh();
        } else {
            pausedManager.setPaused(true);
            highlightController.removeAll();
            suggestionPanel.refresh();
        }
    }

    void onGameTick() {
        if (suggestionManager.isSuggestionRequestInProgress() || suggestionManager.isGraphDataReadingInProgress()) {
            return;
        }
        if (isUncollectedOutOfSync()) {
            log.warn("uncollected is out of sync, it thinks there are items to collect but the GE is open and the Collect button not visible");
            uncollectedManager.clearAllUncollected(osrsLoginManager.getAccountHash());
            suggestionManager.setSuggestionNeeded(true);
        }
        if (osrsLoginManager.hasJustLoggedIn()) {
            return;
        }

        // Check if the suggestion is out of date
        boolean isSuggestionOutOfDate = suggestionManager.suggestionOutOfDate();

        // If a skip/block happened less than 10 seconds ago, ignore the out-of-date check.
        // This gives the user time to see and act on the new suggestion without an automatic
        // refresh immediately overwriting it. This is the fix for the race condition.
        if (System.currentTimeMillis() - lastManualActionTime < 10000) { // 10-second grace period
            isSuggestionOutOfDate = false;
        }

        if ((suggestionManager.isSuggestionNeeded() || isSuggestionOutOfDate) && !(grandExchange.isSlotOpen() && !accountStatusManager.isSuggestionSkipped())) {
            getSuggestionAsync();
        }
    }

    public void skipSuggestion() {
        Suggestion s = suggestionManager.getSuggestion();
        if (s != null) {
            log.debug("User skipping suggestion for item: {}", s.getName());
            // Record the time of the manual action to start the grace period.
            this.lastManualActionTime = System.currentTimeMillis();
            accountStatusManager.setSkipSuggestion(s.getId());
            suggestionManager.setSuggestionNeeded(true);
            suggestionPanel.showLoading();
            getSuggestionAsync(); // Immediately fetch a new suggestion
        } else {
            log.debug("User tried to skip but there was no active suggestion.");
        }
    }

    public void blockCurrentSuggestion() {
        Suggestion s = suggestionManager.getSuggestion();
        if (s == null) {
            log.debug("No current suggestion to block.");
            return;
        }

        String itemName = s.getName() != null ? s.getName() : "this item";

        int choice = JOptionPane.showConfirmDialog(
                suggestionPanel,
                "Do you want to block " + itemName + "?",
                "Confirm Block",
                JOptionPane.YES_NO_OPTION
        );

        if (choice == JOptionPane.YES_OPTION) {
            log.debug("User confirmed blocking item with ID {} ({})", s.getItemId(), itemName);
            // Record the time of the manual action to start the grace period.
            this.lastManualActionTime = System.currentTimeMillis();
            preferencesManager.blockItem(s.getItemId());
            suggestionManager.setSuggestionNeeded(true);
            suggestionPanel.showLoading();
            getSuggestionAsync(); // Immediately fetch a new suggestion
        } else {
            log.debug("User canceled blocking for {}", itemName);
        }
    }

    private boolean isUncollectedOutOfSync() {
        if (client.getTickCount() <= uncollectedManager.getLastUncollectedAddedTick() + 2) {
            return false;
        }
        if (!grandExchange.isHomeScreenOpen() || grandExchange.isCollectButtonVisible()) {
            return false;
        }
        if (uncollectedManager.HasUncollected(osrsLoginManager.getAccountHash())) {
            return true;
        }
        if (suggestionPanel.isCollectItemsSuggested()) {
            return true;
        }
        return false;
    }

    public void getSuggestionAsync() {
        suggestionManager.setSuggestionNeeded(false);
        if (!loginResponseManager.isLoggedIn() || !osrsLoginManager.isValidLoginState()) {
            return;
        }
        if (suggestionManager.isSuggestionRequestInProgress()) {
            return;
        }
        AccountStatus accountStatus = accountStatusManager.getAccountStatus();
        if (accountStatus == null) {
            return;
        }
        suggestionManager.setSuggestionRequestInProgress(true);
        suggestionManager.setGraphDataReadingInProgress(true);
        Suggestion oldSuggestion = suggestionManager.getSuggestion();

        Consumer<Suggestion> suggestionConsumer = (newSuggestion) -> {
            log.info(">>>>>> SUGGESTION RECEIVED: Type='{}', Item='{}', Price={}, Quantity={}, Message='{}'",
                    newSuggestion.getType(),
                    newSuggestion.getName(),
                    newSuggestion.getPrice(),
                    newSuggestion.getQuantity(),
                    newSuggestion.getMessage());

            suggestionManager.setSuggestion(newSuggestion);
            suggestionManager.setSuggestionError(null);
            suggestionManager.setSuggestionRequestInProgress(false);
            log.debug("Received suggestion: {}", newSuggestion.toString());
            offerManager.setOfferJustPlaced(false);
            suggestionPanel.refresh();
            showNotifications(oldSuggestion, newSuggestion, accountStatus);
        };
        Consumer<Data> graphDataConsumer = (d) -> {
            graphPriceGraphController.setSuggestedItemGraphData(d);
            suggestionManager.setGraphDataReadingInProgress(false);
        };
        Consumer<HttpResponseException> onFailure = (e) -> {
            suggestionManager.setSuggestion(null);
            suggestionManager.setSuggestionError(e);
            suggestionManager.setSuggestionRequestInProgress(false);
            suggestionManager.setGraphDataReadingInProgress(false);
            if (e.getResponseCode() == 401) {
                loginResponseManager.reset();
                mainPanel.refresh();
                loginPanel.showLoginErrorMessage("Login timed out. Please log in again");
            } else {
                suggestionPanel.refresh();
            }
        };
        suggestionPanel.refresh();
        log.debug("tick {} getting suggestion", client.getTickCount());

        // Send the request to the server
        apiRequestHandler.getSuggestionAsync(accountStatus.toJson(gson, grandExchange.isOpen(), config.priceGraphWebsite() == BeagleFlipperConfig.PriceGraphWebsite.BEAGLE_FLIPPER), suggestionConsumer, graphDataConsumer, onFailure);

        // The "skip" flag has now been sent to the server. We can safely reset it
        // on the client-side so that the *next* automatic refresh doesn't also
        // try to skip the item.
        if (accountStatus.isSuggestionSkipped()) {
            accountStatusManager.resetSkipSuggestion();
        }
    }


    void showNotifications(Suggestion oldSuggestion, Suggestion newSuggestion, AccountStatus accountStatus) {
        if (shouldNotify(newSuggestion, oldSuggestion)) {
            if (config.enableTrayNotifications()) {
                notifier.notify(newSuggestion.toMessage());
            }
            if (!copilotPanel.isShowing() && config.enableChatNotifications()) {
                showChatNotifications(newSuggestion, accountStatus);
            }
        }
    }

    static boolean shouldNotify(Suggestion newSuggestion, Suggestion oldSuggestion) {
        if (newSuggestion.getType().equals("wait")) {
            return false;
        }
        if (oldSuggestion != null && newSuggestion.equals(oldSuggestion)) {
            return false;
        }
        return true;
    }

    private void showChatNotifications(Suggestion newSuggestion, AccountStatus accountStatus) {
        if (accountStatus.isCollectNeeded(newSuggestion)) {
            clientThread.invokeLater(() -> showChatNotification("Beagle Flipper: Collect items"));
        }
        clientThread.invokeLater(() -> showChatNotification(newSuggestion.toMessage()));
    }

    private void showChatNotification(String message) {
        String chatMessage = new ChatMessageBuilder()
                .append(config.chatTextColor(), message)
                .build();
        client.addChatMessage(ChatMessageType.GAMEMESSAGE, "", chatMessage, "");
    }
}