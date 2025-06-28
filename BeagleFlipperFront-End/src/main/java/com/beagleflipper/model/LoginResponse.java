package com.beagleflipper.model;

import com.google.gson.annotations.SerializedName;
import lombok.Data;
import lombok.RequiredArgsConstructor; // Import if not present

// ADDED: @RequiredArgsConstructor to generate a constructor for final fields
@Data
@RequiredArgsConstructor
public class LoginResponse {
    // ADDED: final to make these part of the constructor
    private final boolean error;
    private final String message;

    @SerializedName("idToken")
    private String jwt;

    @SerializedName("refreshToken")
    private String refreshToken; // ADDED: Field to hold the refresh token

    @SerializedName("localId") // CHANGED: from uid to localId to match your login logic
    private String uid;

    /**
     * Allows us to update the JWT without creating a whole new object,
     * which is perfect for the token refresh flow.
     * @param newJwt The new idToken received from the server.
     */
    public void updateJwt(String newJwt) {
        this.jwt = newJwt;
    }
}