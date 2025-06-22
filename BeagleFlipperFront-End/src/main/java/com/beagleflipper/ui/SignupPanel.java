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
public class SignupPanel extends JPanel {
    private final static int PAGE_WIDTH = 225;

    private final CopilotLoginController copilotLoginController;

    private JPanel signupContainer;
    private JButton signupButton;
    private JTextField usernameTextField;
    private JPasswordField passwordTextField;
    private JLabel errorMessageLabel;
    private JButton backToLoginButton; // NEW: Back to Login button

    public final Spinner spinner = new Spinner();

    @Inject
    public SignupPanel(CopilotLoginController copilotLoginController) {
        this.copilotLoginController = copilotLoginController;
        this.setLayout(new BorderLayout());
        this.setBackground(ColorScheme.DARK_GRAY_COLOR);
        this.setSize(PAGE_WIDTH, 250);

        signupContainer = new JPanel();
        signupContainer.setLayout(new BoxLayout(signupContainer, BoxLayout.PAGE_AXIS));

        createLogo();
        createSpinner();
        createErrorMessageLabel();
        createUsernameInput();
        createPasswordInput();
        createSignupButton();
        createBackToLoginButton(); // NEW: Call method to create back button

        this.add(signupContainer, BorderLayout.NORTH);
    }

    private void createLogo() {
        JPanel container = new JPanel();
        ImageIcon icon = new ImageIcon(ImageUtil.loadImageResource(getClass(), "/logo.png"));
        Image resizedLogo = icon.getImage().getScaledInstance(50, 45, Image.SCALE_SMOOTH);
        JLabel logoLabel = new JLabel(new ImageIcon(resizedLogo));
        logoLabel.setSize(50, 45);
        container.add(logoLabel, BorderLayout.CENTER);
        container.setBorder(new EmptyBorder(10, 0, 10, 0));
        signupContainer.add(container, BorderLayout.CENTER);
    }

    private void createSpinner() {
        JPanel container = new JPanel();
        container.add(spinner, BorderLayout.CENTER);
        signupContainer.add(container, BorderLayout.CENTER);
    }

    public void startLoading() {
        spinner.show();
        signupButton.setEnabled(false);
        backToLoginButton.setEnabled(false); // Disable back button during loading
        errorMessageLabel.setText("");
        errorMessageLabel.setVisible(false);
    }

    public void endLoading() {
        spinner.hide();
        signupButton.setEnabled(true);
        backToLoginButton.setEnabled(true); // Enable back button after loading
    }

    public void showSignupErrorMessage(String message) {
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
        signupContainer.add(container, BorderLayout.CENTER);
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
        usernameTextField.addActionListener(e -> copilotLoginController.onSignupPressed(e));
        JLabel usernameLabel = new JLabel("Email"); // Changed label to Email
        container.add(usernameLabel, BorderLayout.WEST);
        container.add(usernameTextField);
        signupContainer.add(container, BorderLayout.CENTER);
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
        passwordTextField.addActionListener(e -> copilotLoginController.onSignupPressed(e));
        JLabel passwordLabel = new JLabel("Password");
        container.add(passwordLabel);
        container.add(passwordTextField);
        signupContainer.add(container, BorderLayout.CENTER);
    }

    private void createSignupButton() {
        JPanel container = new JPanel();
        signupButton = new JButton("Sign Up");
        signupButton.addActionListener(e -> copilotLoginController.onSignupPressed(e));
        container.add(signupButton);
        signupContainer.add(container, BorderLayout.CENTER);
    }

    // NEW: Method to create the "Back to Login" button
    private void createBackToLoginButton() {
        JPanel container = new JPanel();
        backToLoginButton = new JButton("Back to Login");
        // Action to switch back to the login page
        backToLoginButton.addActionListener(e -> copilotLoginController.showLoginPage());
        container.add(backToLoginButton);
        signupContainer.add(container, BorderLayout.CENTER); // Add it below the signup button
    }

    public void refresh() {
        // Existing refresh logic for the panel can be placed here if needed
    }

    public JTextField getUsernameTextField() {
        return usernameTextField;
    }

    public JPasswordField getPasswordTextField() {
        return passwordTextField;
    }
}