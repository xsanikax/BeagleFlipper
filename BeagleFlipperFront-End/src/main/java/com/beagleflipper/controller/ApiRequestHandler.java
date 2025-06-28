package com.beagleflipper.controller;

import com.beagleflipper.model.*;
import com.beagleflipper.ui.graph.model.Data;
import com.google.gson.*;
import com.google.gson.reflect.TypeToken;
import com.google.inject.Singleton;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.runelite.client.callback.ClientThread;
import okhttp3.*;
import javax.annotation.Nonnull; // FIXED: Import the correct annotation

import javax.inject.Inject;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Type;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;


@Slf4j
@Singleton
@RequiredArgsConstructor(onConstructor_ = @Inject)
public class ApiRequestHandler {

    // --- HARDCODE YOUR BACKEND API URL HERE ---
    private static final String API_BASE_URL = "https://api-jxxf26wq5q-nw.a.run.app";
    // ADDED: URL for Google's token refresh API. Replace with your Web API Key.
    private static final String FIREBASE_REFRESH_URL = "https://securetoken.googleapis.com/v1/token?key=[YOUR_FIREBASE_WEB_API_KEY]";


    public static final String DEFAULT_COPILOT_PRICE_ERROR_MESSAGE = "Unable to fetch price copilot price (possible server update)";
    public static final String DEFAULT_PREMIUM_INSTANCE_ERROR_MESSAGE = "Error loading premium instance data (possible system update)";


    private final OkHttpClient client;
    private final Gson gson;
    private final LoginResponseManager loginResponseManager;
    private final SuggestionPreferencesManager preferencesManager;
    private final ClientThread clientThread;

    private Instant lastDebugMessageSent = Instant.now();


    public void authenticate(String email, String password, Runnable callback) {
        System.out.println("ApiRequestHandler: authenticate method entered.");
        try {
            JsonObject payload = new JsonObject();
            payload.addProperty("email", email);
            payload.addProperty("password", password);
            System.out.println("ApiRequestHandler: Payload created.");

            Request request = new Request.Builder()
                    .url(API_BASE_URL + "/login")
                    // FIXED: Swapped arguments for create() method
                    .post(RequestBody.create(MediaType.get("application/json; charset=utf-8"), payload.toString()))
                    .build();
            System.out.println("ApiRequestHandler: Request built for URL: " + request.url());

            client.newCall(request).enqueue(new Callback() {
                @Override
                // FIXED: Added @Nonnull annotations
                public void onFailure(@Nonnull Call call, @Nonnull IOException e) {
                    System.err.println("ApiRequestHandler: Network call FAILED: " + e.getMessage());
                    log.warn("Login failed: Network or server error", e);
                    clientThread.invoke(() -> {
                        loginResponseManager.setLoginResponse(new LoginResponse(true, "Network or server error"));
                        callback.run();
                    });
                }
                @Override
                // FIXED: Added @Nonnull annotations
                public void onResponse(@Nonnull Call call, @Nonnull Response response) {
                    try (ResponseBody responseBody = response.body()){
                        String body = responseBody != null ? responseBody.string() : "";
                        log.info("Received login response from server. Status: {}, Body: {}", response.code(), body);

                        // Handle non-successful responses first (like 401 Unauthorized)
                        if (!response.isSuccessful()) {
                            // Try to parse an error message from the body
                            try {
                                JsonObject errorJson = gson.fromJson(body, JsonObject.class);
                                String message = errorJson.has("message") ? errorJson.get("message").getAsString() : "Login failed with status " + response.code();
                                loginResponseManager.setLoginResponse(new LoginResponse(true, message));
                            } catch (Exception parseException) {
                                loginResponseManager.setLoginResponse(new LoginResponse(true, "Login failed. Invalid server response."));
                            }
                        } else {
                            // Handle successful (2xx) responses
                            JsonObject jsonResponse = gson.fromJson(body, JsonObject.class);
                            if (jsonResponse.has("idToken") && jsonResponse.has("uid")) {
                                String jwtToken = jsonResponse.get("idToken").getAsString();
                                String userId = jsonResponse.get("uid").getAsString();
                                String refreshToken = jsonResponse.has("refreshToken") ? jsonResponse.get("refreshToken").getAsString() : null;

                                LoginResponse newLogin = new LoginResponse(false, "Login successful");
                                newLogin.setJwt(jwtToken);
                                newLogin.setUid(userId);
                                newLogin.setRefreshToken(refreshToken);
                                loginResponseManager.setLoginResponse(newLogin);
                            } else {
                                log.warn("Login response from server was missing expected fields.");
                                loginResponseManager.setLoginResponse(new LoginResponse(true, "Invalid response from server"));
                            }
                        }
                    } catch (Exception e) {
                        log.warn("Error reading/decoding login response", e);
                        loginResponseManager.setLoginResponse(new LoginResponse(true, "Unexpected response from server"));
                    } finally {
                        clientThread.invoke(callback);
                    }
                }
            });
            System.out.println("ApiRequestHandler: Enqueued OkHttp call for authentication.");
        } catch (Exception e) {
            System.err.println("ApiRequestHandler: Exception before enqueueing authenticate call: " + e.getMessage());
            log.error("Exception during authenticate setup", e);
            clientThread.invoke(() -> {
                loginResponseManager.setLoginResponse(new LoginResponse(true, "Authentication setup error"));
                callback.run();
            });
        }
    }

    public void registerUser(String email, String password, Runnable callback) {
        System.out.println("ApiRequestHandler: registerUser method entered.");
        try {
            JsonObject payload = new JsonObject();
            payload.addProperty("email", email);
            payload.addProperty("password", password);
            payload.addProperty("returnSecureToken", true);
            System.out.println("ApiRequestHandler: Payload created for signup.");

            Request request = new Request.Builder()
                    .url(API_BASE_URL + "/signup")
                    // FIXED: Swapped arguments for create() method
                    .post(RequestBody.create(MediaType.get("application/json; charset=utf-8"), payload.toString()))
                    .build();
            System.out.println("ApiRequestHandler: Request built for URL: " + request.url());

            client.newCall(request).enqueue(new Callback() {
                @Override
                // FIXED: Added @Nonnull annotations
                public void onFailure(@Nonnull Call call, @Nonnull IOException e) {
                    System.err.println("ApiRequestHandler: Network call FAILED for signup: " + e.getMessage());
                    log.warn("Registration failed: Network or server error", e);
                    clientThread.invoke(() -> {
                        loginResponseManager.setLoginResponse(new LoginResponse(true, "Network or server error"));
                        callback.run();
                    });
                }
                @Override
                // FIXED: Added @Nonnull annotations
                public void onResponse(@Nonnull Call call, @Nonnull Response response) {
                    System.out.println("ApiRequestHandler: Received response for signup: " + response.code());
                    try (ResponseBody responseBody = response.body()) {
                        String body = responseBody == null ? "" : responseBody.string();
                        System.out.println("ApiRequestHandler: Signup Response body: " + body);
                        JsonObject jsonResponse = gson.fromJson(body, JsonObject.class);
                        System.out.println("ApiRequestHandler: Signup JSON parsed.");

                        if (response.isSuccessful()) {
                            String message = jsonResponse.has("message") ? jsonResponse.get("message").getAsString() : "Registration successful";
                            String jwtToken = jsonResponse.has("idToken") ? jsonResponse.get("idToken").getAsString() : null;
                            String userId = jsonResponse.has("uid") ? jsonResponse.get("uid").getAsString() : "unknown";
                            String refreshToken = jsonResponse.has("refreshToken") ? jsonResponse.get("refreshToken").getAsString() : null;

                            LoginResponse newLogin = new LoginResponse(false, message);
                            newLogin.setJwt(jwtToken);
                            newLogin.setUid(userId);
                            newLogin.setRefreshToken(refreshToken);
                            loginResponseManager.setLoginResponse(newLogin);
                            System.out.println("ApiRequestHandler: Registration successful response processed.");
                        } else {
                            String message = jsonResponse.has("message") ? jsonResponse.get("message").getAsString() : "Registration failed: " + response.message();
                            loginResponseManager.setLoginResponse(new LoginResponse(true, message));
                            System.err.println("ApiRequestHandler: Registration failed response processed: " + message);
                        }
                    } catch (IOException | JsonParseException | NullPointerException e) {
                        System.err.println("ApiRequestHandler: Error during signup response processing: " + e.getMessage());
                        log.warn("Error reading/decoding registration response", e);
                        loginResponseManager.setLoginResponse(new LoginResponse(true, "Unexpected response from server"));
                    } finally {
                        clientThread.invoke(callback);
                    }
                }
            });
            System.out.println("ApiRequestHandler: Enqueued OkHttp call for registration.");
        } catch (Exception e) {
            System.err.println("ApiRequestHandler: Exception before enqueueing registerUser call: " + e.getMessage());
            log.error("Exception during registerUser setup", e);
            clientThread.invoke(() -> {
                loginResponseManager.setLoginResponse(new LoginResponse(true, "Registration setup error"));
                callback.run();
            });
        }
    }


    private boolean refreshTokenSync() {
        LoginResponse currentLogin = loginResponseManager.getLoginResponse();
        if (currentLogin == null || currentLogin.getRefreshToken() == null) {
            log.warn("Token refresh aborted: No refresh token is available.");
            return false;
        }

        log.info("ID token may have expired. Attempting to refresh...");
        JsonObject payload = new JsonObject();
        payload.addProperty("grant_type", "refresh_token");
        payload.addProperty("refresh_token", currentLogin.getRefreshToken());

        Request request = new Request.Builder()
                .url(FIREBASE_REFRESH_URL)
                // FIXED: Swapped arguments for create() method
                .post(RequestBody.create(MediaType.get("application/json; charset=utf-8"), payload.toString()))
                .build();

        try (Response response = client.newCall(request).execute()) {
            if (!response.isSuccessful() || response.body() == null) {
                log.warn("Token refresh request failed with code: {}. The refresh token may be invalid.", response.code());
                return false;
            }

            String bodyString = response.body().string();
            JsonObject jsonResponse = gson.fromJson(bodyString, JsonObject.class);

            if (jsonResponse.has("id_token")) {
                String newIdToken = jsonResponse.get("id_token").getAsString();
                currentLogin.updateJwt(newIdToken);
                if (jsonResponse.has("refresh_token")) {
                    currentLogin.setRefreshToken(jsonResponse.get("refresh_token").getAsString());
                }
                loginResponseManager.setLoginResponse(currentLogin);
                log.info("Token refreshed successfully.");
                return true;
            } else {
                log.warn("Token refresh response did not contain a new id_token.");
                return false;
            }

        } catch (IOException | JsonParseException e) {
            log.error("Exception during token refresh", e);
            return false;
        }
    }

    public void getSuggestionAsync(JsonObject status,
                                   Consumer<Suggestion> suggestionConsumer,
                                   Consumer<Data> graphDataConsumer,
                                   Consumer<HttpResponseException> onFailure) {
        log.debug("sending status {}", status.toString());
        Request request = new Request.Builder()
                .url(API_BASE_URL + "/suggestion")
                .addHeader("Authorization", "Bearer " + loginResponseManager.getJwtToken())
                .addHeader("Accept", "application/x-msgpack")
                // FIXED: Swapped arguments for create() method
                .post(RequestBody.create(MediaType.get("application/json; charset=utf-8"), status.toString()))
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            // FIXED: Added @Nonnull annotations
            public void onFailure(@Nonnull Call call, @Nonnull IOException e) {
                log.warn("call to get suggestion failed", e);
                clientThread.invoke(() -> onFailure.accept(new HttpResponseException(-1, "Unknown Error")));
            }

            @Override
            // FIXED: Added @Nonnull annotations
            public void onResponse(@Nonnull Call call, @Nonnull Response response) {
                try {
                    if (response.code() == 401) {
                        response.close();
                        if (refreshTokenSync()) {
                            Request newRequest = call.request().newBuilder()
                                    .header("Authorization", "Bearer " + loginResponseManager.getJwtToken())
                                    .build();
                            client.newCall(newRequest).enqueue(this);
                            return;
                        } else {
                            loginResponseManager.reset();
                            clientThread.invoke(() -> onFailure.accept(new HttpResponseException(401, "Session expired. Please log in again.")));
                            return;
                        }
                    }

                    if (!response.isSuccessful()) {
                        log.warn("get suggestion failed with http status code {}", response.code());
                        clientThread.invoke(() -> onFailure.accept(new HttpResponseException(response.code(), extractErrorMessage(response))));
                        return;
                    }
                    handleSuggestionResponse(response, suggestionConsumer, graphDataConsumer);
                } catch (Exception e) {
                    log.warn("error reading/parsing suggestion response body", e);
                    clientThread.invoke(() -> onFailure.accept(new HttpResponseException(-1, "Unknown Error")));
                } finally {
                    response.close();
                }
            }
        });
    }

    private void handleSuggestionResponse(Response response, Consumer<Suggestion> suggestionConsumer, Consumer<Data> graphDataConsumer) throws IOException {
        if (response.body() == null) {
            throw new IOException("empty suggestion request response");
        }
        String contentType = response.header("Content-Type");
        Suggestion s;
        if (contentType != null && contentType.contains("application/x-msgpack")) {
            int contentLength = resolveContentLength(response);
            int suggestionContentLength = resolveSuggestionContentLength(response);
            int graphDataContentLength = contentLength - suggestionContentLength;
            log.debug("msgpack suggestion response size is: {}, suggestion size is {}", contentLength, suggestionContentLength);

            Data d = new Data();
            try (InputStream is = response.body().byteStream()) {
                byte[] suggestionBytes = new byte[suggestionContentLength];
                int bytesRead = is.readNBytes(suggestionBytes, 0, suggestionContentLength);
                if (bytesRead != suggestionContentLength) {
                    throw new IOException("failed to read complete suggestion content: " + bytesRead + " of " + suggestionContentLength + " bytes");
                }
                s = Suggestion.fromMsgPack(ByteBuffer.wrap(suggestionBytes));
                log.debug("suggestion received");
                clientThread.invoke(() -> suggestionConsumer.accept(s));

                if (graphDataContentLength == 0) {
                    d.loadingErrorMessage = "No graph data loaded for this item.";
                } else {
                    try {
                        byte[] remainingBytes = is.readAllBytes();
                        if (graphDataContentLength != remainingBytes.length) {
                            log.error("the graph data bytes read {} doesn't match the expected bytes {}", bytesRead, graphDataContentLength);
                            d.loadingErrorMessage = "There was an issue loading the graph data for this item.";
                        } else {
                            try {
                                d = Data.fromMsgPack(ByteBuffer.wrap(remainingBytes));
                                log.debug("graph data received");
                            } catch (Exception e) {
                                log.error("error deserializing graph data", e);
                                d.loadingErrorMessage = "There was an issue loading the graph data for this item.";
                            }
                        }
                    } catch (IOException e) {
                        log.error("error on reading graph data bytes from the suggestion response", e);
                        d.loadingErrorMessage = "There was an issue loading the graph data for this item.";
                    }
                }
            }
            if (s != null && "wait".equals(s.getType())) {
                d.fromWaitSuggestion = true;
            }
            Data finalD = d;
            clientThread.invoke(() -> graphDataConsumer.accept(finalD));
        } else {
            String body = response.body().string();
            log.debug("json suggestion response size is: {}", body.getBytes().length);
            s = gson.fromJson(body, Suggestion.class);
            clientThread.invoke(() -> suggestionConsumer.accept(s));
            Data d = new Data();
            d.loadingErrorMessage = "No graph data loaded for this item.";
            clientThread.invoke(() -> graphDataConsumer.accept(d));
        }
    }

    private int resolveContentLength(Response resp) throws IOException {
        try {
            String cl = resp.header("Content-Length");
            return Integer.parseInt(cl != null ? cl : "0");
        } catch (NumberFormatException e) {
            throw new IOException("Failed to parse response Content-Length", e);
        }
    }

    private int resolveSuggestionContentLength(Response resp) throws IOException {
        try {
            String cl = resp.header("X-Suggestion-Content-Length");
            return Integer.parseInt(cl != null ? cl : "0");
        } catch (NumberFormatException e) {
            throw new IOException("Failed to parse response X-Suggestion-Content-Length", e);
        }
    }

    private String extractErrorMessage(Response response) {
        if (response.body() != null) {
            try {
                String bodyStr = response.peekBody(1_048_576).string();
                if (!bodyStr.trim().isEmpty() && bodyStr.trim().startsWith("{") && bodyStr.trim().endsWith("}")) {
                    JsonObject errorJson = gson.fromJson(bodyStr, JsonObject.class);
                    if (errorJson != null && errorJson.has("message")) {
                        return errorJson.get("message").getAsString();
                    }
                }
                return "Server responded with: " + bodyStr;
            } catch (JsonSyntaxException | IOException e) {
                log.warn("Failed to parse error message from HTTP response (code: {}).", response.code(), e);
                return "Server error: " + response.message();
            }
        }
        return "Unknown server error (No response body)";
    }

    public void sendTransactionsAsync(List<Transaction> transactions, String displayName, Consumer<List<FlipV2>> onSuccess, Consumer<HttpResponseException> onFailure) {
        log.debug("sending {} transactions for display name {}", displayName, transactions.size());
        JsonArray body = new JsonArray();
        for (Transaction transaction : transactions) {
            body.add(transaction.toJsonObject());
        }
        String encodedDisplayName = URLEncoder.encode(displayName, StandardCharsets.UTF_8);
        Request request = new Request.Builder()
                .url(API_BASE_URL + "/profit-tracking/client-transactions?display_name=" + encodedDisplayName)
                .addHeader("Authorization", "Bearer " + loginResponseManager.getJwtToken())
                // FIXED: Swapped arguments for create() method
                .post(RequestBody.create(MediaType.get("application/json; charset=utf-8"), body.toString()))
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            // FIXED: Added @Nonnull annotations
            public void onFailure(@Nonnull Call call, @Nonnull IOException e) {
                log.warn("call to sync transactions failed", e);
                onFailure.accept(new HttpResponseException(-1, "Unknown Error"));
            }
            @Override
            // FIXED: Added @Nonnull annotations
            public void onResponse(@Nonnull Call call, @Nonnull Response response) {
                try {
                    if (response.code() == 401) {
                        response.close();
                        if (refreshTokenSync()) {
                            Request newRequest = call.request().newBuilder()
                                    .header("Authorization", "Bearer " + loginResponseManager.getJwtToken())
                                    .build();
                            client.newCall(newRequest).enqueue(this);
                            return;
                        } else {
                            loginResponseManager.reset();
                            onFailure.accept(new HttpResponseException(401, "Session expired. Please log in again."));
                            return;
                        }
                    }

                    if (!response.isSuccessful()) {
                        String errorMessage = extractErrorMessage(response);
                        log.warn("call to sync transactions failed status code {}, error message {}", response.code(), errorMessage);
                        onFailure.accept(new HttpResponseException(response.code(), errorMessage));
                        return;
                    }
                    String body = response.body() == null ? "" : response.body().string();
                    List<FlipV2> changedFlips = gson.fromJson(body, new TypeToken<List<FlipV2>>() {}.getType());
                    onSuccess.accept(changedFlips);
                } catch (IOException | JsonParseException e) {
                    log.warn("error reading/parsing sync transactions response body", e);
                    onFailure.accept(new HttpResponseException(-1, "Unknown Error"));
                } finally {
                    response.close();
                }
            }
        });
    }

    public <T> T doHttpRequest(String method, JsonElement bodyJson, String fullUrl, Type responseType) throws HttpResponseException {
        String jwtToken = loginResponseManager.getJwtToken();
        if (jwtToken == null) {
            throw new IllegalStateException("Not authenticated. Please log in.");
        }

        // FIXED: Swapped arguments for create() method and fixed typo utf-s
        RequestBody body = bodyJson == null ? null : RequestBody.create(MediaType.get("application/json; charset=utf-8"), bodyJson.toString());
        Request request = new Request.Builder()
                .url(fullUrl)
                .addHeader("Authorization", "Bearer " + jwtToken)
                .method(method, body)
                .build();

        try {
            Response response = client.newCall(request).execute();

            if (response.code() == 401) {
                response.close();
                if (refreshTokenSync()) {
                    Request newRequest = request.newBuilder()
                            .header("Authorization", "Bearer " + loginResponseManager.getJwtToken())
                            .build();
                    response = client.newCall(newRequest).execute();
                } else {
                    loginResponseManager.reset();
                    throw new HttpResponseException(401, "Authorization token is invalid or expired. Please log in again.");
                }
            }

            try (Response finalResponse = response) {
                if (finalResponse.isSuccessful()) {
                    if (responseType == Void.class || finalResponse.body() == null) {
                        return null;
                    }
                    String responseBody = finalResponse.body().string();
                    return gson.fromJson(responseBody, responseType);
                } else {
                    throw new HttpResponseException(finalResponse.code(), extractErrorMessage(finalResponse));
                }
            }
        } catch (JsonSyntaxException | IOException e) {
            throw new HttpResponseException(-1, "Unknown server error (possible system update)", e);
        }
    }

    public void asyncGetItemPriceWithGraphData(int itemId, String displayName, Consumer<ItemPrice> consumer) {
        JsonObject body = new JsonObject();
        body.add("item_id", new JsonPrimitive(itemId));
        body.add("display_name", new JsonPrimitive(displayName));
        body.addProperty("f2p_only", preferencesManager.getPreferences().isF2pOnlyMode());
        body.addProperty("timeframe_minutes", preferencesManager.getTimeframe());
        body.addProperty("include_graph_data", true);
        log.debug("requesting price graph data for item {}", itemId);
        Request request = new Request.Builder()
                .url(API_BASE_URL + "/prices")
                .addHeader("Authorization", "Bearer " + loginResponseManager.getJwtToken())
                // FIXED: Swapped arguments for create() method
                .post(RequestBody.create(MediaType.get("application/json; charset=utf-8"), body.toString()))
                .build();

        client.newBuilder()
                .callTimeout(30, TimeUnit.SECONDS)
                .build()
                .newCall(request)
                .enqueue(new Callback() {
                    @Override
                    // FIXED: Added @Nonnull annotations
                    public void onFailure(@Nonnull Call call, @Nonnull IOException e) {
                        log.error("error fetching copilot price for item {}", itemId, e);
                        ItemPrice ip = new ItemPrice(0, 0, DEFAULT_COPILOT_PRICE_ERROR_MESSAGE, null);
                        clientThread.invoke(() -> consumer.accept(ip));
                    }
                    @Override
                    // FIXED: Added @Nonnull annotations
                    public void onResponse(@Nonnull Call call, @Nonnull Response response) {
                        try {
                            if (response.code() == 401) {
                                response.close();
                                if(refreshTokenSync()) {
                                    client.newCall(call.request().newBuilder().header("Authorization", "Bearer " + loginResponseManager.getJwtToken()).build()).enqueue(this);
                                    return;
                                }
                            }

                            if (!response.isSuccessful()) {
                                log.error("get copilot price for item {} failed with http status code {}", itemId, response.code());
                                throw new IOException("Request failed with code " + response.code());
                            } else {
                                byte[] d = response.body().bytes();
                                ItemPrice ip = ItemPrice.fromMsgPack(ByteBuffer.wrap(d));
                                log.debug("price graph data received for item {}", itemId);
                                clientThread.invoke(() -> consumer.accept(ip));
                            }
                        } catch (Exception e) {
                            log.error("error fetching copilot price for item {}", itemId, e);
                            ItemPrice ip = new ItemPrice(0, 0, DEFAULT_COPILOT_PRICE_ERROR_MESSAGE, null);
                            clientThread.invoke(() -> consumer.accept(ip));
                        } finally {
                            response.close();
                        }
                    }
                });
    }

    public void getItemPriceAsync(int itemId, String displayName, Consumer<ItemPrice> consumer) {
        asyncGetItemPriceWithGraphData(itemId, displayName, consumer);
    }

    public void asyncUpdatePremiumInstances(Consumer<PremiumInstanceStatus> consumer, List<String> displayNames) {
        JsonObject payload = new JsonObject();
        JsonArray arr = new JsonArray();
        displayNames.forEach(arr::add);
        payload.add("premium_display_names", arr);

        Request request = new Request.Builder()
                .url(API_BASE_URL + "/premium-instances/update-assignments")
                .addHeader("Authorization", "Bearer " + loginResponseManager.getJwtToken())
                // FIXED: Swapped arguments for create() method
                .post(RequestBody.create(MediaType.get("application/json; charset=utf-8"), payload.toString()))
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            // FIXED: Added @Nonnull annotations
            public void onFailure(@Nonnull Call call, @Nonnull IOException e) {
                log.error("error updating premium instance assignments", e);
                clientThread.invoke(() -> consumer.accept(PremiumInstanceStatus.ErrorInstance(DEFAULT_PREMIUM_INSTANCE_ERROR_MESSAGE)));
            }
            @Override
            // FIXED: Added @Nonnull annotations
            public void onResponse(@Nonnull Call call, @Nonnull Response response) {
                try {
                    if (!response.isSuccessful()) {
                        log.error("update premium instances failed with http status code {}", response.code());
                        clientThread.invoke(() -> consumer.accept(PremiumInstanceStatus.ErrorInstance(DEFAULT_PREMIUM_INSTANCE_ERROR_MESSAGE)));
                    } else {
                        PremiumInstanceStatus ip = gson.fromJson(response.body().string(), PremiumInstanceStatus.class);
                        clientThread.invoke(() -> consumer.accept(ip));
                    }
                } catch (Exception e) {
                    log.error("error updating premium instance assignments", e);
                    clientThread.invoke(() -> consumer.accept(PremiumInstanceStatus.ErrorInstance(DEFAULT_PREMIUM_INSTANCE_ERROR_MESSAGE)));
                } finally {
                    response.close();
                }
            }
        });
    }

    public void asyncGetPremiumInstanceStatus(Consumer<PremiumInstanceStatus> consumer) {
        Request request = new Request.Builder()
                .url(API_BASE_URL + "/premium-instances/status")
                .addHeader("Authorization", "Bearer " + loginResponseManager.getJwtToken())
                .get()
                .build();
        client.newCall(request).enqueue(new Callback() {
            @Override
            // FIXED: Added @Nonnull annotations
            public void onFailure(@Nonnull Call call, @Nonnull IOException e) {
                log.error("error fetching premium instance status", e);
                clientThread.invoke(() -> consumer.accept(PremiumInstanceStatus.ErrorInstance(DEFAULT_PREMIUM_INSTANCE_ERROR_MESSAGE)));
            }
            @Override
            // FIXED: Added @Nonnull annotations
            public void onResponse(@Nonnull Call call, @Nonnull Response response) {
                try {
                    if (!response.isSuccessful()) {
                        log.error("get premium instance status failed with http status code {}", response.code());
                        clientThread.invoke(() -> consumer.accept(PremiumInstanceStatus.ErrorInstance(DEFAULT_PREMIUM_INSTANCE_ERROR_MESSAGE)));
                    } else {
                        PremiumInstanceStatus ip = gson.fromJson(response.body().string(), PremiumInstanceStatus.class);
                        clientThread.invoke(() -> consumer.accept(ip));
                    }
                } catch (Exception e) {
                    log.error("error fetching premium instance status", e);
                    clientThread.invoke(() -> consumer.accept(PremiumInstanceStatus.ErrorInstance(DEFAULT_PREMIUM_INSTANCE_ERROR_MESSAGE)));
                } finally {
                    response.close();
                }
            }
        });
    }

    public Map<String, Integer> loadUserDisplayNames(String displayName) throws HttpResponseException {
        Type respType = new TypeToken<Map<String, Integer>>() {}.getType();
        String encodedDisplayName = URLEncoder.encode(displayName, StandardCharsets.UTF_8);
        return doHttpRequest("GET", null, API_BASE_URL + "/profit-tracking/rs-account-names?display_name=" + encodedDisplayName, respType);
    }

    public List<FlipV2> LoadFlips(String displayName) throws HttpResponseException {
        Type respType = new TypeToken<List<FlipV2>>() {}.getType();
        String encodedDisplayName = URLEncoder.encode(displayName, StandardCharsets.UTF_8);
        return doHttpRequest("GET", null, API_BASE_URL + "/profit-tracking/client-flips?display_name=" + encodedDisplayName, respType);
    }

    public void sendDebugData(JsonObject bodyJson) {
        String jwtToken = loginResponseManager.getJwtToken();
        Instant now = Instant.now();
        if (now.minusSeconds(5).isBefore(lastDebugMessageSent)) {
            return;
        }
        // FIXED: Swapped arguments for create() method
        RequestBody body = RequestBody.create(MediaType.get("application/json; charset=utf-8"), bodyJson.toString());
        Request request = new Request.Builder()
                .url(API_BASE_URL + "/debug-data")
                .addHeader("Authorization", "Bearer " + jwtToken)
                .method("POST", body)
                .build();
        client.newCall(request).enqueue(new Callback() {
            @Override
            // FIXED: Added @Nonnull annotations
            public void onFailure(@Nonnull Call call, @Nonnull IOException e) {
                log.debug("failed to send debug data", e);
            }
            @Override
            // FIXED: Added @Nonnull annotations
            public void onResponse(@Nonnull Call call, @Nonnull Response response) {
                response.close();
            }
        });
        lastDebugMessageSent = Instant.now();
    }
}