package com.beagleflipper.controller;

import lombok.Getter;
import javax.inject.Singleton;

@Singleton
public class ApiConfig {

    /**
     * The base URL for your deployed Firebase Cloud Functions.
     * TODO: Replace the placeholder URL with your actual function URL.
     * It will look something like: "https://us-central1-your-project-id.cloudfunctions.net/api"
     */
    @Getter
    private final String apiBase = "https://api-jxxf26wq5q-nw.a.run.app";
}