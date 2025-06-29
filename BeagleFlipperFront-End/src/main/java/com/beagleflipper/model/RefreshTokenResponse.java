package com.beagleflipper.model;

import com.google.gson.annotations.SerializedName;
import lombok.Data;

/**
 * Represents the JSON response from the Firebase token refresh endpoint.
 */
@Data
public class RefreshTokenResponse {

    @SerializedName("id_token")
    private String idToken;

    @SerializedName("refresh_token")
    private String refreshToken;
}