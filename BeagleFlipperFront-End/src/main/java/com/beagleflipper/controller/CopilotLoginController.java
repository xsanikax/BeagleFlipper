package com.beagleflipper.controller;

import java.awt.event.ActionEvent;

import com.beagleflipper.model.*;
import com.beagleflipper.ui.LoginPanelV2;
import com.beagleflipper.ui.MainPanel;
import com.beagleflipper.ui.SignupPanel;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;

import javax.inject.Inject;
import javax.inject.Singleton;

@Slf4j
@Singleton
@RequiredArgsConstructor(onConstructor_ = @Inject)
public class CopilotLoginController {

    @Setter
    private LoginPanelV2 loginPanel;
    @Setter
    private SignupPanel signupPanel;
    @Setter
    private MainPanel mainPanel;
    private final ApiRequestHandler apiRequestHandler;
    private final FlipManager flipManager;
    private final HighlightController highlightController;
    private final LoginResponseManager loginResponseManager;
    private final SuggestionManager suggestionManager;
    private final OsrsLoginManager osrsLoginManager;
    private final SessionManager sessionManager;
    private final TransactionManger transactionManger;

    private String email;
    private String password;

    public void onLoginPressed(ActionEvent event) {
        log.debug("onLoginPressed called."); // NEW LOG
        Runnable loginCallback = () -> {
            log.debug("Login callback executed."); // NEW LOG
            if (loginResponseManager.isLoggedIn()) {
                flipManager.loadFlipsAsync();
                mainPanel.renderLoggedInView();
                String displayName = osrsLoginManager.getPlayerDisplayName();
                if(displayName != null) {
                    flipManager.setIntervalDisplayName(displayName);
                    flipManager.setIntervalStartTime(sessionManager.getCachedSessionData().startTime);
                    transactionManger.scheduleSyncIn(0, displayName);
                }
            } else {
                LoginResponse loginResponse = loginResponseManager.getLoginResponse();
                String message = (loginResponse != null && loginResponse.message != null) ? loginResponse.message : "Login failed";
                loginPanel.showLoginErrorMessage(message);
            }
            loginPanel.endLoading();
        };

        if (this.email == null || this.email.isEmpty() || this.password == null || this.password.isEmpty()) {
            log.debug("Login: Email or password missing."); // NEW LOG
            loginPanel.showLoginErrorMessage("Email and password are required.");
            return;
        }
        log.debug("Login: Starting loading, calling API handler."); // NEW LOG
        loginPanel.startLoading();
        apiRequestHandler.authenticate(this.email, this.password, loginCallback);
        log.debug("Login: API handler call dispatched."); // NEW LOG
    }

    public void onSignupPressed(ActionEvent event) {
        log.debug("onSignupPressed called."); // NEW LOG
        // Null check for signupPanel added to prevent NPE on initial click if not set
        if (signupPanel == null) {
            log.error("SignupPanel is null in CopilotLoginController.onSignupPressed. It might not be injected/set correctly.");
            // Try to show error on login panel as a fallback
            if (loginPanel != null) {
                loginPanel.showLoginErrorMessage("Application error: Signup form not initialized. Please restart plugin.");
            }
            return;
        }

        Runnable signupCallback = () -> {
            log.debug("Signup callback executed."); // NEW LOG
            if (loginResponseManager.isLoggedIn()) {
                flipManager.loadFlipsAsync();
                mainPanel.renderLoggedInView();
                String displayName = osrsLoginManager.getPlayerDisplayName();
                if(displayName != null) {
                    flipManager.setIntervalDisplayName(displayName);
                    flipManager.setIntervalStartTime(sessionManager.getCachedSessionData().startTime);
                    transactionManger.scheduleSyncIn(0, displayName);
                }
            } else {
                LoginResponse loginResponse = loginResponseManager.getLoginResponse();
                String message = (loginResponse != null && loginResponse.message != null) ? loginResponse.message : "Signup failed";
                signupPanel.showSignupErrorMessage(message);
            }
            signupPanel.endLoading();
        };

        if (this.email == null || this.email.isEmpty() || this.password == null || this.password.isEmpty()) {
            log.debug("Signup: Email or password missing."); // NEW LOG
            signupPanel.showSignupErrorMessage("Email and password are required.");
            return;
        }
        log.debug("Signup: Starting loading, calling API handler."); // NEW LOG
        signupPanel.startLoading();
        apiRequestHandler.registerUser(this.email, this.password, signupCallback);
        log.debug("Signup: API handler call dispatched."); // NEW LOG
    }

    public void onLogout() {
        flipManager.reset();
        loginResponseManager.reset();
        suggestionManager.reset();
        highlightController.removeAll();
        mainPanel.renderLoggedOutView();
    }

    public void onEmailTextChanged(String newEmail) {
        this.email = newEmail;
    }

    public void onPasswordTextChanged(String newPassword) {
        this.password = newPassword;
    }

    public void showSignupPage() {
        log.debug("showSignupPage called."); // NEW LOG
        mainPanel.showSignupView();
        if (loginPanel != null) {
            loginPanel.getUsernameTextField().setText("");
            loginPanel.getPasswordTextField().setText("");
        }
        if (signupPanel != null) {
            signupPanel.getUsernameTextField().setText("");
            signupPanel.getPasswordTextField().setText("");
        }
        this.email = null;
        this.password = null;
    }

    public void showLoginPage() {
        log.debug("showLoginPage called."); // NEW LOG
        mainPanel.showLoginView();
        if (loginPanel != null) {
            loginPanel.getUsernameTextField().setText("");
            loginPanel.getPasswordTextField().setText("");
        }
        if (signupPanel != null) {
            signupPanel.getUsernameTextField().setText("");
            signupPanel.getPasswordTextField().setText("");
        }
        this.email = null;
        this.password = null;
    }
}