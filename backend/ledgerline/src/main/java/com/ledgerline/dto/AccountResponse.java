package com.ledgerline.dto;

import java.time.Instant;
import java.util.UUID;

public class AccountResponse {

    private UUID id;
    private UUID ownerId;
    private String type;
    private String name;
    private Long balance;
    private String status;
    private Instant createdAt;

    public AccountResponse() {}

    public AccountResponse(UUID id, UUID ownerId, String type, String name, Long balance, String status, Instant createdAt) {
        this.id = id;
        this.ownerId = ownerId;
        this.type = type;
        this.name = name;
        this.balance = balance;
        this.status = status;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getOwnerId() {
        return ownerId;
    }

    public String getType() {
        return type;
    }

    public String getName() {
        return name;
    }

    public Long getBalance() {
        return balance;
    }

    public String getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}

