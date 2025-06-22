package com.beagleflipper.ui;

import com.beagleflipper.controller.CopilotLoginController;
import com.beagleflipper.model.LoginResponseManager;
import net.runelite.client.ui.ColorScheme;
import net.runelite.client.ui.PluginPanel;
import net.runelite.client.util.ImageUtil;
import net.runelite.client.util.LinkBrowser;

import javax.inject.Inject;
import javax.inject.Singleton;
import javax.swing.*;
import javax.swing.border.EmptyBorder;
import java.awt.*;
import java.awt.image.BufferedImage;

import static com.beagleflipper.ui.UIUtilities.buildButton;

@Singleton
public class MainPanel extends PluginPanel {

    public final LoginPanelV2 loginPanel;
    public final SignupPanel signupPanel;
    public final CopilotPanel copilotPanel;
    private final LoginResponseManager loginResponseManager;
    private final CopilotLoginController copilotLoginController;

    private JPanel cardPanel;
    private CardLayout cardLayout;
    private JPanel topBarPanel;

    private Boolean isLoggedInView;

    public static final String LOGIN_VIEW = "LOGIN_VIEW";
    public static final String SIGNUP_VIEW = "SIGNUP_VIEW";
    public static final String COPILOT_VIEW = "COPILOT_VIEW";


    @Inject
    public MainPanel(CopilotPanel copilotPanel,
                     LoginPanelV2 loginPanel,
                     SignupPanel signupPanel,
                     LoginResponseManager loginResponseManager,
                     CopilotLoginController copilotLoginController) {
        super(false);
        this.loginPanel = loginPanel;
        this.signupPanel = signupPanel;
        this.copilotPanel = copilotPanel;
        this.loginResponseManager = loginResponseManager;
        this.copilotLoginController = copilotLoginController;

        setLayout(new BorderLayout());
        setBorder(BorderFactory.createEmptyBorder(5, 6, 5, 6));

        // Initialize top bar once
        topBarPanel = new JPanel(new BorderLayout());
        topBarPanel.setBorder(new EmptyBorder(3, 0, 10, 0));
        add(topBarPanel, BorderLayout.NORTH);

        // Initialize card panel once
        cardLayout = new CardLayout();
        cardPanel = new JPanel(cardLayout);
        cardPanel.setBackground(ColorScheme.DARK_GRAY_COLOR);

        // Add panels to the cardPanel once
        cardPanel.add(loginPanel, LOGIN_VIEW);
        cardPanel.add(signupPanel, SIGNUP_VIEW);
        cardPanel.add(copilotPanel, COPILOT_VIEW);
        add(cardPanel, BorderLayout.CENTER);

        // Initial view setup
        updateTopBar(false); // Default to logged out top bar
        cardLayout.show(cardPanel, LOGIN_VIEW); // Explicitly show login view on init
        revalidate();
        repaint();
    }

    public void refresh() {
        if(!SwingUtilities.isEventDispatchThread()) {
            SwingUtilities.invokeLater(this::refresh);
            return;
        }
        boolean shouldBeLoggedInView = loginResponseManager.isLoggedIn();
        if(shouldBeLoggedInView) {
            if (isLoggedInView == null || !isLoggedInView) {
                renderLoggedInView();
            }
            copilotPanel.refresh();
        } else {
            if (isLoggedInView == null || isLoggedInView) {
                renderLoggedOutView();
            }
            loginPanel.refresh();
            signupPanel.refresh();
            copilotPanel.suggestionPanel.refresh();
        }
    }

    public void renderLoggedOutView() {
        updateTopBar(false);
        loginPanel.showLoginErrorMessage("");
        signupPanel.showSignupErrorMessage("");
        cardLayout.show(cardPanel, LOGIN_VIEW);
        revalidate();
        repaint();
        isLoggedInView = false;
    }

    public void renderLoggedInView() {
        updateTopBar(true);
        cardLayout.show(cardPanel, COPILOT_VIEW);
        revalidate();
        repaint();
        isLoggedInView = true;
    }

    private void updateTopBar(boolean isLoggedIn) {
        topBarPanel.removeAll();
        JPanel buttonsPanel = new JPanel();
        buttonsPanel.setBackground(ColorScheme.DARK_GRAY_COLOR);
        int columns = isLoggedIn ? 4 : 3; // 4 columns when logged in (Discord, Web, Logout)
        buttonsPanel.setLayout(new GridLayout(1, columns));

        JLabel discord = buildTopBarUriButton(UIUtilities.discordIcon,
                "Beagle Flipper Discord",
                "https://discord.gg/UyQxA4QJAq");
        buttonsPanel.add(discord);

        JLabel website = buildTopBarUriButton(UIUtilities.internetIcon,
                "Beagle Flipper website",
                "https://beagleflipper.com");
        buttonsPanel.add(website);

        if (isLoggedIn) {
            BufferedImage icon = ImageUtil.loadImageResource(getClass(), UIUtilities.logoutIcon);
            // This is the existing logout button; ensure it's correctly wired
            JLabel logout = buildButton(icon, "Log out", () -> {
                copilotLoginController.onLogout();
                renderLoggedOutView(); // This already handles reverting to login screen
            });
            buttonsPanel.add(logout);
        }

        topBarPanel.add(buttonsPanel, BorderLayout.CENTER);
        topBarPanel.revalidate();
        topBarPanel.repaint();
    }

    private JLabel buildTopBarUriButton(String iconPath, String tooltip, String uriString) {
        BufferedImage icon = ImageUtil.loadImageResource(getClass(), iconPath);
        return buildButton(icon, tooltip, () -> {
            LinkBrowser.browse(uriString);
        });
    }

    public void showLoginView() {
        cardLayout.show(cardPanel, LOGIN_VIEW);
        loginPanel.showLoginErrorMessage("");
        revalidate();
        repaint();
    }

    public void showSignupView() {
        cardLayout.show(cardPanel, SIGNUP_VIEW);
        signupPanel.showSignupErrorMessage("");
        revalidate();
        repaint();
    }
}
