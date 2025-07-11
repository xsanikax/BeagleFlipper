package com.beagleflipper.util;

import java.awt.Desktop;
import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;

public class LinkBrowser
{
    public static void browse(String url)
    {
        if (Desktop.isDesktopSupported())
        {
            try
            {
                Desktop.getDesktop().browse(new URI(url));
            }
            catch (IOException | URISyntaxException e)
            {
                e.printStackTrace();
            }
        }
    }
}
