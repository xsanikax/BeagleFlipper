package com.beagleflipper.controller;

import com.beagleflipper.model.*;
import com.beagleflipper.ui.*;
import com.google.gson.Gson;
import com.google.inject.Provides;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.*;
import net.runelite.api.events.*;
import net.runelite.client.callback.ClientThread;
import net.runelite.client.config.ConfigManager;
import net.runelite.client.eventbus.Subscribe;
import net.runelite.client.events.ClientShutdown;
import net.runelite.client.events.ConfigChanged;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginDescriptor;
import net.runelite.client.ui.ClientToolbar;
import net.runelite.client.ui.NavigationButton;
import net.runelite.client.ui.overlay.OverlayManager;
import net.runelite.client.util.ImageUtil;

import javax.inject.Inject;
import java.awt.image.BufferedImage;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Slf4j
@PluginDescriptor(
		name = "Beagle Flipper",
		description = "Your AI assistant for trading"
)
public class BeagleFlipperPlugin extends Plugin {

	@Inject
	private BeagleFlipperConfig config;
	@Inject
	private Client client;
	@Inject
	private ClientThread clientThread;
	@Inject
	private ScheduledExecutorService executorService;
	@Inject
	private ClientToolbar clientToolbar;
	@Inject
	private Gson gson;
	@Inject
	private GrandExchange grandExchange;
	@Inject
	private GrandExchangeCollectHandler grandExchangeCollectHandler;
	@Inject
	private GrandExchangeOfferEventHandler offerEventHandler;
	@Inject
	private ApiRequestHandler apiRequestHandler;
	@Inject
	private AccountStatusManager accountStatusManager;
	@Inject
	private SuggestionController suggestionController;
	@Inject
	private SuggestionManager suggestionManager;
	@Inject
	private WebHookController webHookController;
	@Inject
	private KeybindHandler keybindHandler;
	@Inject
	private CopilotLoginController copilotLoginController;
	@Inject
	private OverlayManager overlayManager;
	@Inject
	private LoginResponseManager loginResponseManager;
	@Inject
	private HighlightController highlightController;
	@Inject
	private GameUiChangesHandler gameUiChangesHandler;
	@Inject
	private OsrsLoginManager osrsLoginManager;
	@Inject
	private FlipManager flipManager;
	@Inject
	private SessionManager sessionManager;
	@Inject
	private GrandExchangeUncollectedManager grandExchangeUncollectedManager;
	@Inject
	private TransactionManger transactionManger;
	@Inject
	private OfferManager offerManager;
	@Inject
	private PriceGraphOpener priceGraphOpener;

	private MainPanel mainPanel;
	private StatsPanelV2 statsPanel;
	private NavigationButton navButton;

	@Override
	protected void startUp() throws Exception {
		Persistance.setUp(gson);

		mainPanel = injector.getInstance(MainPanel.class);
		final BufferedImage icon = ImageUtil.loadImageResource(getClass(), "/icon-small.png");
		navButton = NavigationButton.builder()
				.tooltip("Beagle Flipper")
				.icon(icon)
				.priority(3)
				.panel(mainPanel)
				.build();
		clientToolbar.addNavigation(navButton);

		copilotLoginController.setLoginPanel(mainPanel.loginPanel);
		copilotLoginController.setSignupPanel(mainPanel.signupPanel);
		copilotLoginController.setMainPanel(mainPanel);
		suggestionController.setCopilotPanel(mainPanel.copilotPanel);
		suggestionController.setMainPanel(mainPanel);
		suggestionController.setLoginPanel(mainPanel.loginPanel);
		suggestionController.setSuggestionPanel(mainPanel.copilotPanel.suggestionPanel);
		grandExchangeCollectHandler.setSuggestionPanel(mainPanel.copilotPanel.suggestionPanel);
		statsPanel = mainPanel.copilotPanel.statsPanel;

		mainPanel.refresh();

		executorService.scheduleAtFixedRate(() ->
						clientThread.invoke(() -> {
							boolean loginValid = osrsLoginManager.isValidLoginState();
							if (loginValid) {
								AccountStatus accStatus = accountStatusManager.getAccountStatus();
								boolean isFlipping = accStatus != null && accStatus.currentlyFlipping();
								long cashStack = (accStatus == null || accStatus.getInventory() == null) ? 0 : accStatus.getInventory().getTotalGp();
								if (sessionManager.updateSessionStats(isFlipping, cashStack)) {
									mainPanel.copilotPanel.statsPanel.refresh(false, loginResponseManager.isLoggedIn() && osrsLoginManager.isValidLoginState());
								}
							}
						})
				, 2000, 1000, TimeUnit.MILLISECONDS);
	}

	@Override
	protected void shutDown() throws Exception {
		offerManager.saveAll();
		highlightController.removeAll();
		clientToolbar.removeNavigation(navButton);
		if (loginResponseManager.isLoggedIn()) {
			String displayName = osrsLoginManager.getLastDisplayName();
			if (displayName != null) {
				webHookController.sendMessage(flipManager.calculateStats(sessionManager.getCachedSessionData().startTime, displayName), sessionManager.getCachedSessionData(), displayName, false);
			}
		}
		keybindHandler.unregister();
	}

	@Provides
	public BeagleFlipperConfig provideConfig(ConfigManager configManager) {
		return configManager.getConfig(BeagleFlipperConfig.class);
	}

	@Subscribe
	public void onGrandExchangeOfferChanged(GrandExchangeOfferChanged event) {
		offerEventHandler.onGrandExchangeOfferChanged(event);
	}

	@Subscribe
	public void onItemContainerChanged(ItemContainerChanged event) {
		if (event.getContainerId() == InventoryID.INVENTORY.getId() && grandExchange.isOpen()) {
			suggestionManager.setSuggestionNeeded(true);
		}
	}

	@Subscribe
	public void onGameTick(GameTick event) {
		suggestionController.onGameTick();
		offerEventHandler.onGameTick();
	}

	@Subscribe
	public void onMenuOptionClicked(MenuOptionClicked event) {
		int slot = grandExchange.getOpenSlot();
		grandExchangeCollectHandler.handleCollect(event, slot);
		gameUiChangesHandler.handleMenuOptionClicked(event);
	}

	@Subscribe
	public void onMenuEntryAdded(MenuEntryAdded event) {
		priceGraphOpener.injectCopilotPriceGraphMenuEntry(event);
	}

	@Subscribe
	public void onWidgetLoaded(WidgetLoaded event) {
		gameUiChangesHandler.onWidgetLoaded(event);
	}

	@Subscribe
	public void onWidgetClosed(WidgetClosed event) {
		gameUiChangesHandler.onWidgetClosed(event);
	}

	@Subscribe
	public void onVarbitChanged(VarbitChanged event) {
		gameUiChangesHandler.onVarbitChanged(event);
	}

	@Subscribe
	public void onVarClientStrChanged(VarClientStrChanged event) {
		gameUiChangesHandler.onVarClientStrChanged(event);
	}

	@Subscribe
	public void onGameStateChanged(GameStateChanged event) {
		switch (event.getGameState()) {
			case LOGIN_SCREEN:
				sessionManager.reset();
				suggestionManager.reset();
				osrsLoginManager.reset();
				accountStatusManager.reset();
				grandExchangeUncollectedManager.reset();
				statsPanel.refresh(true, loginResponseManager.isLoggedIn() && osrsLoginManager.isValidLoginState());
				mainPanel.refresh();
				break;
			case LOGGING_IN:
			case HOPPING:
			case CONNECTION_LOST:
				osrsLoginManager.setLastLoginTick(client.getTickCount());
				break;
			case LOGGED_IN:
				clientThread.invokeLater(() -> {
					if (client.getGameState() != GameState.LOGGED_IN) {
						return true;
					}
					final String name = osrsLoginManager.getPlayerDisplayName();
					if (name == null) {
						return false;
					}

					if (loginResponseManager.isLoggedIn()) {
						flipManager.loadFlipsAsync();
						transactionManger.scheduleSyncIn(0, name);
					}

					statsPanel.resetIntervalDropdownToSession();
					flipManager.setIntervalDisplayName(name);
					flipManager.setIntervalStartTime(sessionManager.getCachedSessionData().startTime);
					statsPanel.refresh(true, loginResponseManager.isLoggedIn() && osrsLoginManager.isValidLoginState());
					mainPanel.refresh();

					return true;
				});
		}
	}

	@Subscribe
	public void onVarClientIntChanged(VarClientIntChanged event) {
		gameUiChangesHandler.onVarClientIntChanged(event);
	}

	@Subscribe
	public void onClientShutdown(ClientShutdown clientShutdownEvent) {
		log.debug("client shutdown event received");
		offerManager.saveAll();
		if (loginResponseManager.isLoggedIn()) {
			String displayName = osrsLoginManager.getLastDisplayName();
			if (displayName != null) {
				webHookController.sendMessage(flipManager.calculateStats(sessionManager.getCachedSessionData().startTime, displayName), sessionManager.getCachedSessionData(), displayName, false);
			}
		}
		keybindHandler.unregister();
	}

	@Subscribe
	public void onConfigChanged(ConfigChanged event) {
		if (event.getGroup().equals("beagleflipper")) {
			log.debug("copilot config changed event received");
			if (event.getKey().equals("profitAmountColor") || event.getKey().equals("lossAmountColor")) {
				mainPanel.copilotPanel.statsPanel.refresh(true, loginResponseManager.isLoggedIn() && osrsLoginManager.isValidLoginState());
			}
			if (event.getKey().equals("suggestionHighlights")) {
				clientThread.invokeLater(() -> highlightController.redraw());
			}
		}
	}
}