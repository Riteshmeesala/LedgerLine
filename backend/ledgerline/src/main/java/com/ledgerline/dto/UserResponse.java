package com.ledgerline.dto;

import com.ledgerline.model.UserRole;

import java.util.UUID;

public class UserResponse {

    private UUID id;
    private String email;
    private UserRole role;
    private boolean enabled;
    private Integer failedLogins;
    private Boolean locked;

    public UserResponse(UUID id, String email, UserRole role, boolean enabled) {
        this(id, email, role, enabled, 0, false);
    }

    public UserResponse(UUID id, String email, UserRole role, boolean enabled, Integer failedLogins, Boolean locked) {
        this.id = id;
        this.email = email;
        this.role = role;
        this.enabled = enabled;
        this.failedLogins = failedLogins;
        this.locked = locked;
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

    public Integer getFailedLogins() {
        return failedLogins;
    }

    public Boolean isLocked() {
        return locked;
    }
}

