package com.ledgerline.dto;

import com.ledgerline.model.UserRole;

import java.util.UUID;

public class UserResponse {

    private UUID id;
    private String email;
    private UserRole role;
    private boolean enabled;

    public UserResponse(UUID id, String email, UserRole role, boolean enabled) {
        this.id = id;
        this.email = email;
        this.role = role;
        this.enabled = enabled;
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public UserRole getRole() {
        return role;
    }

    public boolean isEnabled() {
        return enabled;
    }
}

