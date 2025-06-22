package com.beagleflipper.model;

import com.google.gson.annotations.SerializedName;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class LoginResponse {
    public boolean error;
    public String message;
    public String jwt;

    @SerializedName("user_id")
    // FIX: Changed type from int to String
    public String userId;
}