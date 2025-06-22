package com.beagleflipper.ui;

import javax.swing.text.JTextComponent;
import java.awt.*;
import java.awt.event.FocusEvent;
import java.awt.event.FocusListener;

/**
 * Allows a phantom-style placeholder text in JTextField and JPasswordField.
 */
public class PlaceholderFocusListener implements FocusListener
{
    private final String placeholder;
    private final JTextComponent field;
    private boolean showingPlaceholder;

    public PlaceholderFocusListener(String placeholder, JTextComponent field)
    {
        this.placeholder = placeholder;
        this.field = field;
        this.showingPlaceholder = true;
        showPlaceholder();
    }

    private void showPlaceholder()
    {
        field.setText(placeholder);
        field.setForeground(Color.GRAY);
        showingPlaceholder = true;
    }

    private void hidePlaceholder()
    {
        field.setText("");
        field.setForeground(Color.WHITE);
        showingPlaceholder = false;
    }

    @Override
    public void focusGained(FocusEvent e)
    {
        if (showingPlaceholder)
        {
            hidePlaceholder();
        }
    }

    @Override
    public void focusLost(FocusEvent e)
    {
        if (field.getText().isEmpty())
        {
            showPlaceholder();
        }
    }

    public boolean isShowingPlaceholder()
    {
        return showingPlaceholder;
    }
}
