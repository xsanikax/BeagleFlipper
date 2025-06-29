package com.beagleflipper.controller;

import javax.inject.Singleton;

/**
 * Centralizes API configuration details like the base URL.
 */
@Singleton
public class ApiConfig {
    // This URL is now managed in one place.
    private static final String API_BASE_URL = "https://api-jxxf26wq5q-nw.a.run.app";

    public String getApiBase() {
        return API_BASE_URL;
    }
}