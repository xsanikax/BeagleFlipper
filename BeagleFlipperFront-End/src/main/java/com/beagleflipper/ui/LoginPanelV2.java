package com.beagleflipper.ui;

import com.beagleflipper.controller.CopilotLoginController;
import net.runelite.client.ui.ColorScheme;
import net.runelite.client.util.ImageUtil;

import javax.inject.Inject;
import javax.inject.Singleton;
import javax.swing.*;
import javax.swing.border.EmptyBorder;
import javax.swing.border.LineBorder;
import java.awt.*;
import java.awt.event.KeyEvent;
import java.awt.event.KeyListener;


@Singleton
public class LoginPanelV2 extends JPanel {
    private final static int PAGE_WIDTH = 225;

    private final CopilotLoginController copilotLoginController;

    private JPanel loginContainer;
    private JButton loginButton;
    private JTextField usernameTextField;
    private JPasswordField passwordTextField;
    private JLabel errorMessageLabel;

    private JButton signupRedirectButton;

    public final Spinner spinner = new Spinner();

    @Inject
    public LoginPanelV2(CopilotLoginController copilotLoginController) {
        this.copilotLoginController = copilotLoginController;
        this.setLayout(new BorderLayout());
        this.setBackground(ColorScheme.DARK_GRAY_COLOR);
        this.setSize(PAGE_WIDTH, 250);

        loginContainer = new JPanel();
        loginContainer.setLayout(new BoxLayout(loginContainer, BoxLayout.PAGE_AXIS));

        createLogo();
        createSpinner();
        createErrorMessageLabel();
        createUsernameInput();
        createPasswordInput();
        createLoginButton();
        createSignupRedirectButton();

        this.add(loginContainer, BorderLayout.NORTH);
    }

    private void createLogo() {
        JPanel container = new JPanel();
        ImageIcon icon = new ImageIcon(ImageUtil.loadImageResource(getClass(), "/logo.png"));
        Image resizedLogo = icon.getImage().getScaledInstance(50, 45, Image.SCALE_SMOOTH);
        JLabel logoLabel = new JLabel(new ImageIcon(resizedLogo));
        logoLabel.setSize(50, 45);
        container.add(logoLabel, BorderLayout.CENTER);
        container.setBorder(new EmptyBorder(10, 0, 10, 0));
        loginContainer.add(container, BorderLayout.CENTER);
    }

    private void createSpinner() {
        JPanel container = new JPanel();
        container.add(spinner, BorderLayout.CENTER);
        loginContainer.add(container, BorderLayout.CENTER);
    }

    public void startLoading() {
        spinner.show();
        loginButton.setEnabled(false);
        signupRedirectButton.setEnabled(false);
        errorMessageLabel.setText("");
        errorMessageLabel.setVisible(false);
    }

    public void endLoading() {
        spinner.hide();
        loginButton.setEnabled(true);
        signupRedirectButton.setEnabled(true);
    }

    public void showLoginErrorMessage(String message) {
        errorMessageLabel.setText("<html><p>" + message + "</p></html>");
        errorMessageLabel.setVisible(true);
    }

    private void createErrorMessageLabel() {
        JPanel container = new JPanel();
        errorMessageLabel = new JLabel();
        errorMessageLabel.setForeground(Color.RED);
        errorMessageLabel.setHorizontalAlignment(SwingConstants.LEFT);
        errorMessageLabel.setSize(PAGE_WIDTH, 40);
        errorMessageLabel.setVisible(false);
        container.add(errorMessageLabel);
        loginContainer.add(container, BorderLayout.CENTER);
    }

    private void createUsernameInput() {
        JPanel container = new JPanel(new GridLayout(2, 1));
        container.setBorder(new EmptyBorder(0, 0, 10, 0));
        usernameTextField = new JTextField();
        usernameTextField.setSize(PAGE_WIDTH, 40);
        usernameTextField.setBorder(new LineBorder(ColorScheme.BRAND_ORANGE, 1));
        usernameTextField.addKeyListener(new KeyListener() {
            @Override
            public void keyTyped(KeyEvent event) {}

            @Override
            public void keyReleased(KeyEvent event) {
                JTextField textField = (JTextField) event.getSource();
                String text = textField.getText();
                copilotLoginController.onEmailTextChanged(text);
            }

            @Override
            public void keyPressed(KeyEvent event) {}
        });
        usernameTextField.addActionListener(e -> copilotLoginController.onLoginPressed(e)); // Explicitly pass ActionEvent
        JLabel usernameLabel = new JLabel("Email"); // Changed label to Email
        container.add(usernameLabel, BorderLayout.WEST);
        container.add(usernameTextField);
        loginContainer.add(container, BorderLayout.CENTER);
    }

    private void createPasswordInput() {
        JPanel container = new JPanel(new GridLayout(2, 1));
        container.setBorder(new EmptyBorder(0, 0, 10, 0));
        passwordTextField = new JPasswordField();
        passwordTextField.setSize(PAGE_WIDTH, 40);
        passwordTextField.setBorder(new LineBorder(ColorScheme.BRAND_ORANGE, 1));
        passwordTextField.addKeyListener(new KeyListener() {
            @Override
            public void keyTyped(KeyEvent event) {}

            @Override
            public void keyReleased(KeyEvent event) {
                JTextField textField = (JTextField) event.getSource();
                String text = textField.getText();
                copilotLoginController.onPasswordTextChanged(text);
            }

            @Override
            public void keyPressed(KeyEvent event) {}
        });
        passwordTextField.addActionListener(e -> copilotLoginController.onLoginPressed(e)); // Explicitly pass ActionEvent
        JLabel passwordLabel = new JLabel("Password");
        container.add(passwordLabel);
        container.add(passwordTextField);
        loginContainer.add(container, BorderLayout.CENTER);
    }

    private void createLoginButton() {
        JPanel container = new JPanel();
        loginButton = new JButton("Login");
        loginButton.addActionListener(e -> copilotLoginController.onLoginPressed(e)); // Explicitly pass ActionEvent
        container.add(loginButton);
        loginContainer.add(container, BorderLayout.CENTER);
    }

    private void createSignupRedirectButton() {
        JPanel container = new JPanel();
        signupRedirectButton = new JButton("Sign Up");
        signupRedirectButton.addActionListener(e -> copilotLoginController.showSignupPage());
        container.add(signupRedirectButton);
        loginContainer.add(container, BorderLayout.CENTER);
    }

    public void refresh() {
        // Existing refresh logic
    }

    public JTextField getUsernameTextField() {
        return usernameTextField;
    }

    public JPasswordField getPasswordTextField() {
        return passwordTextField;
    }
}
