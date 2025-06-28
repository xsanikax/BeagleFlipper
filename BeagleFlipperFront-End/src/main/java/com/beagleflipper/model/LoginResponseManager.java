package com.beagleflipper.model;

import com.beagleflipper.controller.Persistance; // FIXED: Correctly imports from the 'controller' package
import com.google.common.base.Strings;
import com.google.gson.Gson;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import lombok.extern.slf4j.Slf4j;
import java.io.IOException;
import java.util.concurrent.ScheduledExecutorService;


@Slf4j
@Singleton
public class LoginResponseManager {

    private final ScheduledExecutorService executorService;
    private LoginResponse cachedLoginResponse;

    @Inject
    public LoginResponseManager(Gson gson, ScheduledExecutorService executorService) {
        this.executorService = executorService;
    }

    public synchronized LoginResponse getLoginResponse() {
        if (cachedLoginResponse == null) {
            cachedLoginResponse = load();
        }
        return cachedLoginResponse;
    }

    public synchronized void setLoginResponse(LoginResponse loginResponse) {
        if (loginResponse == null) {
            reset();
            return;
        }
        cachedLoginResponse = loginResponse;
        saveAsync();
    }

    public LoginResponse load() {
        try {
            // FIXED: Calls the correct 'loadLoginResponse' method from your Persistance class
            LoginResponse loginResponse = Persistance.loadLoginResponse();

            if (loginResponse != null && Strings.isNullOrEmpty(loginResponse.getJwt())) {
                log.warn("Loaded login response file but jwt was missing, deleting it.");
                Persistance.deleteLoginResponse(); // Use the helper to delete
                return null;
            }
            return loginResponse;
        } catch (IOException e) {
            log.warn("Could not load login response from file.", e);
            // If there's an error reading the file, it might be corrupt, so delete it.
            Persistance.deleteLoginResponse();
            return null;
        }
    }

    public void reset() {
        cachedLoginResponse = null;
        // FIXED: Calls the correct 'deleteLoginResponse' method from your Persistance class
        Persistance.deleteLoginResponse();
    }

    public void saveAsync() {
        executorService.submit(() -> {
            LoginResponse loginResponse = getLoginResponse();
            if (loginResponse == null) {
                return;
            }
            // FIXED: Calls the correct 'saveLoginResponse' method from your Persistance class
            Persistance.saveLoginResponse(loginResponse);
        });
    }

    public boolean isLoggedIn() {
        LoginResponse response = getLoginResponse();
        return response != null && !response.isError() && !Strings.isNullOrEmpty(response.getJwt());
    }

    public String getJwtToken() {
        LoginResponse response = getLoginResponse();
        return response != null ? response.getJwt() : null;
    }
}