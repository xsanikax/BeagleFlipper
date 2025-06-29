package com.beagleflipper.controller;

import com.beagleflipper.model.LoginResponse;
import com.beagleflipper.model.LoginResponseManager;
import com.beagleflipper.model.RefreshTokenResponse;
import com.google.gson.Gson;
import com.google.gson.JsonSyntaxException;
import lombok.extern.slf4j.Slf4j;
import okhttp3.*;

import javax.inject.Inject;
import javax.inject.Singleton;
import java.io.IOException;
import java.util.Objects;

@Slf4j
@Singleton
public class AuthenticatedApiClient {

    // Define the media type for JSON content
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

    private final OkHttpClient okHttpClient;
    private final Gson gson;
    private final LoginResponseManager loginResponseManager;
    private final ApiConfig apiConfig;

    @Inject
    public AuthenticatedApiClient(OkHttpClient okHttpClient, Gson gson, LoginResponseManager loginResponseManager, ApiConfig apiConfig) {
        this.okHttpClient = okHttpClient;
        this.gson = gson;
        this.loginResponseManager = loginResponseManager;
        this.apiConfig = apiConfig;
    }

    /**
     * Performs an authenticated GET request, handling token refresh automatically.
     *
     * @param path The API endpoint path (e.g., "/suggestion").
     * @param responseType The class of the expected response object.
     * @return The parsed response object, or null on failure.
     */
    public <T> T get(String path, Class<T> responseType) throws IOException {
        return executeRequest(buildGetRequest(path), responseType, 0);
    }

    /**
     * Performs an authenticated POST request, handling token refresh automatically.
     *
     * @param path The API endpoint path (e.g., "/suggestion").
     * @param body The object to be sent as the JSON request body.
     * @param responseType The class of the expected response object.
     * @return The parsed response object, or null on failure.
     */
    public <T> T post(String path, Object body, Class<T> responseType) throws IOException {
        return executeRequest(buildPostRequest(path, body), responseType, 0);
    }

    private <T> T executeRequest(Request request, Class<T> responseType, int retryCount) throws IOException {
        if (retryCount > 1) {
            log.warn("API request to {} failed after retry.", request.url());
            // Prevent infinite recursion
            return null;
        }

        try (Response response = okHttpClient.newCall(request).execute()) {
            if (response.isSuccessful()) {
                // Use a null-safe check on the response body
                ResponseBody responseBody = response.body();
                if (responseBody == null) {
                    return null;
                }
                return gson.fromJson(responseBody.charStream(), responseType);
            }

            // Check for an expired token (HTTP 401)
            if (response.code() == 401) {
                // Check if the server specifically told us the token is expired
                if (isTokenExpiredError(response)) {
                    log.info("ID token expired. Attempting to refresh...");
                    boolean refreshed = refreshToken();
                    if (refreshed) {
                        log.info("Token refreshed successfully. Retrying original request.");
                        // Re-build the request with the new token and retry
                        Request newRequest = request.newBuilder()
                                .header("Authorization", "Bearer " + loginResponseManager.getJwtToken())
                                .build();
                        return executeRequest(newRequest, responseType, retryCount + 1);
                    } else {
                        log.warn("Failed to refresh token. User must log in again.");
                        loginResponseManager.reset(); // Clear invalid login data
                        return null;
                    }
                }
            }

            log.warn("API request to {} failed with code {}: {}", request.url(), response.code(), response.message());
            return null;
        }
    }

    private boolean refreshToken() {
        LoginResponse currentResponse = loginResponseManager.getLoginResponse();
        if (currentResponse == null || currentResponse.getRefreshToken() == null) {
            log.error("Cannot refresh token: no refresh token available.");
            return false;
        }

        String requestJson = "{\"refreshToken\": \"" + currentResponse.getRefreshToken() + "\"}";
        RequestBody body = RequestBody.create(JSON, requestJson);

        Request request = new Request.Builder()
                .url(apiConfig.getApiBase() + "/refresh-token")
                .post(body)
                .build();

        try (Response response = okHttpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                log.error("Refresh token request failed with code: {}", response.code());
                return false;
            }

            ResponseBody responseBody = response.body();
            if (responseBody == null) {
                log.error("Refresh token response was empty.");
                return false;
            }

            RefreshTokenResponse refreshResponse = gson.fromJson(responseBody.charStream(), RefreshTokenResponse.class);
            if (refreshResponse != null && refreshResponse.getIdToken() != null) {
                // SUCCESS! Update the stored JWT and save it.
                // FIXED: Called the correct 'setJwt' method instead of 'updateJwt'
                currentResponse.setJwt(refreshResponse.getIdToken());
                loginResponseManager.setLoginResponse(currentResponse); // This also triggers saveAsync
                return true;
            }
        } catch (IOException | JsonSyntaxException e) {
            log.error("Failed to execute or parse refresh token response", e);
        }
        return false;
    }

    private Request buildGetRequest(String path) {
        return new Request.Builder()
                .url(apiConfig.getApiBase() + path)
                .header("Authorization", "Bearer " + loginResponseManager.getJwtToken())
                .get()
                .build();
    }

    private Request buildPostRequest(String path, Object body) {
        String jsonBody = gson.toJson(body);
        RequestBody requestBody = RequestBody.create(JSON, jsonBody);
        return new Request.Builder()
                .url(apiConfig.getApiBase() + path)
                .header("Authorization", "Bearer " + loginResponseManager.getJwtToken())
                .post(requestBody)
                .build();
    }

    /**
     * Checks the response body for the specific 'token_expired' error from the backend.
     */
    private boolean isTokenExpiredError(Response response) {
        try {
            // It's important to use peekBody to avoid consuming the response body,
            // allowing other parts of the code to read it if needed.
            String responseBody = response.peekBody(1024).string();
            return responseBody.contains("\"error\":\"token_expired\"");
        } catch (Exception e) {
            log.warn("Could not peek response body to check for token expired error.", e);
            return false;
        }
    }
}