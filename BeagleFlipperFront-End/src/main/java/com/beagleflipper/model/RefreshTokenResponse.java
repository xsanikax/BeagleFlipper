package com.beagleflipper.model;

import com.google.gson.annotations.SerializedName;
import lombok.Data;

/**
 * Represents the JSON response from the /refresh-token endpoint.
 */
@Data
public class RefreshTokenResponse {
    @SerializedName("id_token") // Match the key from Firebase Auth REST API
    private String idToken;

    @SerializedName("refresh_token")
    private String refreshToken;

    @SerializedName("user_id")
    private String userId;

    @SerializedName("token_type")
    private String tokenType;

    @SerializedName("expires_in")
    private String expiresIn;
}