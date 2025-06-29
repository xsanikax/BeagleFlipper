package com.beagleflipper.model;

import com.google.gson.annotations.SerializedName;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class LoginResponse {
    private boolean error;
    private String message;

    @SerializedName("idToken")
    private String jwt;

    @SerializedName("localId")
    private String uid;

    @SerializedName("refreshToken")
    private String refreshToken;

    // Convenience constructor for creating error responses
    public LoginResponse(boolean error, String message) {
        this.error = error;
        this.message = message;
    }
}